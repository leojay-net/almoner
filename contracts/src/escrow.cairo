//! Almoner escrow anonymizer.
//!
//! DRAFT - not reviewed, not audited, not deployed to mainnet.
//!
//! Lets a payer fund many recipients in a single privacy-pool transaction,
//! including recipients who have never registered a viewing key. Each allocation
//! is parked behind a commitment; the recipient claims it into their own private
//! note once they are registered, and anything unclaimed at expiry is refundable.
//!
//! The pool calls `privacy_invoke` after withdrawing the total to this contract.
//! `refund` is an ordinary public entry point that needs no proof, which is what
//! makes unattended expiry sweeps possible while the mainnet proving service
//! remains unavailable.

use privacy::objects::OpenNoteDeposit;
use starknet::ContractAddress;

/// Lifecycle of a single allocation. `None` is first so an unwritten storage
/// slot reads back as "no such allocation".
#[derive(Serde, Copy, Drop, PartialEq, Debug, Default, starknet::Store)]
pub enum AllocationStatus {
    #[default]
    None,
    Funded,
    Claimed,
    Refunded,
}

/// Stored state for one allocation.
#[derive(Serde, Copy, Drop, PartialEq, Debug, starknet::Store)]
pub struct AllocationEntry {
    pub token: ContractAddress,
    pub amount: u128,
    /// Unix seconds after which the allocation may be refunded. `0` never expires.
    pub expiry: u64,
    /// Where `refund` sends the tokens. Fixed at funding time.
    pub refund_recipient: ContractAddress,
    pub status: AllocationStatus,
}

/// One payout in a batch, supplied by the payer at funding time.
#[derive(Serde, Copy, Drop, PartialEq, Debug)]
pub struct Allocation {
    /// `poseidon(ALMONER_COMMITMENT_TAG, secret)`, computed off-chain. Only the
    /// hash is published; the secret travels to the recipient out of band.
    pub commitment_hash: felt252,
    pub token: ContractAddress,
    pub amount: u128,
    pub expiry: u64,
    pub refund_recipient: ContractAddress,
}

/// One claim in a batch.
#[derive(Serde, Copy, Drop, PartialEq, Debug)]
pub struct ClaimRequest {
    /// Preimage of a stored commitment.
    pub secret: felt252,
    /// Open note to credit, resolved by the wallet from `${openNoteIds[N]}`.
    pub note_id: felt252,
}

#[derive(Serde, Copy, Drop, PartialEq, Debug)]
pub enum EscrowOperation {
    /// Park a batch of allocations. Returns an empty span.
    Deposit,
    /// Redeem a batch of commitments into open notes.
    Claim,
}

#[starknet::interface]
pub trait IAlmonerEscrow<T> {
    /// Entry point the privacy pool calls via `INVOKE_SELECTOR`.
    ///
    /// `Deposit` reads `allocations` and ignores `claims`; `Claim` reads `claims`
    /// and ignores `allocations`. Calldata order must match this signature exactly,
    /// because the pool deserializes straight into these parameters.
    fn privacy_invoke(
        ref self: T,
        operation: EscrowOperation,
        allocations: Span<Allocation>,
        claims: Span<ClaimRequest>,
    ) -> Span<OpenNoteDeposit>;

    /// Returns an expired, unclaimed allocation to its refund recipient.
    ///
    /// Permissionless and proof-free: funds can only move to the recipient fixed
    /// at funding time, so letting anyone trigger it costs nothing and lets a
    /// keeper sweep on a schedule.
    fn refund(ref self: T, commitment_hash: felt252);

    /// `refund` over many commitments. Reverts if any one is not refundable.
    fn refund_batch(ref self: T, commitment_hashes: Span<felt252>);

    fn get_allocation(self: @T, commitment_hash: felt252) -> AllocationEntry;

    /// Total still owed for `token` across every funded allocation.
    fn get_outstanding(self: @T, token: ContractAddress) -> u128;

    fn privacy_pool(self: @T) -> ContractAddress;
}

/// Domain separation, so a commitment here cannot collide with a hash used elsewhere.
pub const ALMONER_COMMITMENT_TAG: felt252 = 'ALMONER_COMMITMENT:V1';

pub mod errors {
    pub const CALLER_NOT_POOL: felt252 = 'CALLER_NOT_POOL';
    pub const ZERO_COMMITMENT: felt252 = 'ZERO_COMMITMENT';
    pub const ZERO_TOKEN: felt252 = 'ZERO_TOKEN';
    pub const ZERO_AMOUNT: felt252 = 'ZERO_AMOUNT';
    pub const ZERO_REFUND_RECIPIENT: felt252 = 'ZERO_REFUND_RECIPIENT';
    pub const ZERO_POOL: felt252 = 'ZERO_POOL';
    pub const COMMITMENT_EXISTS: felt252 = 'COMMITMENT_EXISTS';
    pub const NOT_FUNDED: felt252 = 'NOT_FUNDED';
    pub const UNDERFUNDED: felt252 = 'UNDERFUNDED';
    pub const EXPIRED: felt252 = 'EXPIRED';
    pub const NOT_YET_EXPIRED: felt252 = 'NOT_YET_EXPIRED';
    pub const NO_EXPIRY: felt252 = 'NO_EXPIRY';
    pub const EMPTY_BATCH: felt252 = 'EMPTY_BATCH';
}

/// Commitment hash for a secret. Mirrored by the TypeScript client.
pub fn compute_commitment_hash(secret: felt252) -> felt252 {
    core::poseidon::poseidon_hash_span([ALMONER_COMMITMENT_TAG, secret].span())
}

#[starknet::contract]
pub mod AlmonerEscrow {
    use core::num::traits::Zero;
    use openzeppelin::interfaces::token::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use privacy::objects::OpenNoteDeposit;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};
    use super::{
        Allocation, AllocationEntry, AllocationStatus, ClaimRequest, EscrowOperation,
        IAlmonerEscrow, compute_commitment_hash, errors,
    };

    #[storage]
    struct Storage {
        /// Pinned at deployment. Only this address may drive `privacy_invoke`.
        privacy_pool: ContractAddress,
        allocations: Map<felt252, AllocationEntry>,
        /// Sum of funded allocations per token, so a batch cannot promise more
        /// than the pool actually delivered.
        outstanding: Map<ContractAddress, u128>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        AllocationFunded: AllocationFunded,
        AllocationClaimed: AllocationClaimed,
        AllocationRefunded: AllocationRefunded,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AllocationFunded {
        #[key]
        pub commitment_hash: felt252,
        #[key]
        pub token: ContractAddress,
        pub amount: u128,
        pub expiry: u64,
        pub refund_recipient: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AllocationClaimed {
        #[key]
        pub commitment_hash: felt252,
        #[key]
        pub token: ContractAddress,
        pub amount: u128,
        pub note_id: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AllocationRefunded {
        #[key]
        pub commitment_hash: felt252,
        #[key]
        pub token: ContractAddress,
        pub amount: u128,
        pub refund_recipient: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, privacy_pool: ContractAddress) {
        assert(privacy_pool.is_non_zero(), errors::ZERO_POOL);
        self.privacy_pool.write(privacy_pool);
    }

    #[abi(embed_v0)]
    pub impl AlmonerEscrowImpl of IAlmonerEscrow<ContractState> {
        fn privacy_invoke(
            ref self: ContractState,
            operation: EscrowOperation,
            allocations: Span<Allocation>,
            claims: Span<ClaimRequest>,
        ) -> Span<OpenNoteDeposit> {
            let pool = self.privacy_pool.read();
            assert(get_caller_address() == pool, errors::CALLER_NOT_POOL);

            match operation {
                EscrowOperation::Deposit => self.fund(allocations),
                EscrowOperation::Claim => self.redeem(claims, pool),
            }
        }

        fn refund(ref self: ContractState, commitment_hash: felt252) {
            self.refund_one(commitment_hash);
        }

        fn refund_batch(ref self: ContractState, commitment_hashes: Span<felt252>) {
            assert(commitment_hashes.len() > 0, errors::EMPTY_BATCH);
            for commitment_hash in commitment_hashes {
                self.refund_one(*commitment_hash);
            }
        }

        fn get_allocation(self: @ContractState, commitment_hash: felt252) -> AllocationEntry {
            self.allocations.read(commitment_hash)
        }

        fn get_outstanding(self: @ContractState, token: ContractAddress) -> u128 {
            self.outstanding.read(token)
        }

        fn privacy_pool(self: @ContractState) -> ContractAddress {
            self.privacy_pool.read()
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Parks a batch. The pool has already transferred the total to this
        /// contract via a `Withdraw` action in the same transaction.
        fn fund(ref self: ContractState, allocations: Span<Allocation>) -> Span<OpenNoteDeposit> {
            assert(allocations.len() > 0, errors::EMPTY_BATCH);
            let this = get_contract_address();

            for allocation in allocations {
                let Allocation {
                    commitment_hash, token, amount, expiry, refund_recipient,
                } = *allocation;

                assert(commitment_hash.is_non_zero(), errors::ZERO_COMMITMENT);
                assert(token.is_non_zero(), errors::ZERO_TOKEN);
                assert(amount.is_non_zero(), errors::ZERO_AMOUNT);
                assert(refund_recipient.is_non_zero(), errors::ZERO_REFUND_RECIPIENT);

                let existing = self.allocations.read(commitment_hash);
                assert(existing.status == AllocationStatus::None, errors::COMMITMENT_EXISTS);

                self
                    .allocations
                    .write(
                        commitment_hash,
                        AllocationEntry {
                            token,
                            amount,
                            expiry,
                            refund_recipient,
                            status: AllocationStatus::Funded,
                        },
                    );

                let owed = self.outstanding.read(token) + amount;
                self.outstanding.write(token, owed);

                // The contract must actually hold what it now promises. Without
                // this, a batch allocating more than the pool withdrew would
                // create claims payable out of other people's escrowed funds.
                let held = IERC20Dispatcher { contract_address: token }.balance_of(this);
                assert(held >= owed.into(), errors::UNDERFUNDED);

                self
                    .emit(
                        AllocationFunded {
                            commitment_hash, token, amount, expiry, refund_recipient,
                        },
                    );
            }

            // Tokens stay parked; there is nothing for the pool to credit yet.
            let nothing_to_credit: Array<OpenNoteDeposit> = array![];
            nothing_to_credit.span()
        }

        /// Redeems commitments into open notes the pool will credit.
        fn redeem(
            ref self: ContractState, claims: Span<ClaimRequest>, pool: ContractAddress,
        ) -> Span<OpenNoteDeposit> {
            assert(claims.len() > 0, errors::EMPTY_BATCH);
            let this = get_contract_address();
            let now = get_block_timestamp();
            let mut deposits: Array<OpenNoteDeposit> = array![];

            for claim in claims {
                let ClaimRequest { secret, note_id } = *claim;
                let commitment_hash = compute_commitment_hash(secret);

                let entry = self.allocations.read(commitment_hash);
                // Covers "never funded", "already claimed" and "already refunded".
                assert(entry.status == AllocationStatus::Funded, errors::NOT_FUNDED);
                assert(entry.expiry == 0 || now < entry.expiry, errors::EXPIRED);

                self
                    .allocations
                    .write(
                        commitment_hash,
                        AllocationEntry { status: AllocationStatus::Claimed, ..entry },
                    );
                self
                    .outstanding
                    .write(entry.token, self.outstanding.read(entry.token) - entry.amount);

                // Add to any allowance already standing, so several claims on the
                // same token in one batch do not overwrite each other.
                let erc20 = IERC20Dispatcher { contract_address: entry.token };
                let standing = erc20.allowance(this, pool);
                erc20.approve(pool, standing + entry.amount.into());

                deposits
                    .append(OpenNoteDeposit { note_id, token: entry.token, amount: entry.amount });

                self
                    .emit(
                        AllocationClaimed {
                            commitment_hash, token: entry.token, amount: entry.amount, note_id,
                        },
                    );
            }

            deposits.span()
        }

        fn refund_one(ref self: ContractState, commitment_hash: felt252) {
            let entry = self.allocations.read(commitment_hash);
            assert(entry.status == AllocationStatus::Funded, errors::NOT_FUNDED);
            assert(entry.expiry != 0, errors::NO_EXPIRY);
            assert(get_block_timestamp() >= entry.expiry, errors::NOT_YET_EXPIRED);

            // State first, transfer after.
            self
                .allocations
                .write(
                    commitment_hash,
                    AllocationEntry { status: AllocationStatus::Refunded, ..entry },
                );
            self.outstanding.write(entry.token, self.outstanding.read(entry.token) - entry.amount);

            IERC20Dispatcher { contract_address: entry.token }
                .transfer(entry.refund_recipient, entry.amount.into());

            self
                .emit(
                    AllocationRefunded {
                        commitment_hash,
                        token: entry.token,
                        amount: entry.amount,
                        refund_recipient: entry.refund_recipient,
                    },
                );
        }
    }
}
