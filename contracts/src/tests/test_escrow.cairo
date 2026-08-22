use almoner_escrow::escrow::{
    Allocation, AllocationStatus, ClaimRequest, EscrowOperation, IAlmonerEscrowDispatcher,
    IAlmonerEscrowDispatcherTrait, compute_commitment_hash, errors,
};
use almoner_escrow::test_utils_contracts::mock_erc20::{
    IMockERC20MintDispatcher, IMockERC20MintDispatcherTrait,
};
use openzeppelin::interfaces::token::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp_global,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

fn POOL() -> ContractAddress {
    'POOL'.try_into().unwrap()
}

fn PAYER_REFUND() -> ContractAddress {
    'PAYER_REFUND'.try_into().unwrap()
}

fn STRANGER() -> ContractAddress {
    'STRANGER'.try_into().unwrap()
}

const SECRET: felt252 = 'secret-one';
const OTHER_SECRET: felt252 = 'secret-two';
const NOTE_ID: felt252 = 'note-1';
const EXPIRY: u64 = 1_000;

/// Deploys the escrow plus a mock token, and mints `funding` to the escrow to
/// stand in for the pool's `Withdraw` leg.
fn setup(funding: u256) -> (IAlmonerEscrowDispatcher, IERC20Dispatcher) {
    let token_class = declare("MockERC20").unwrap().contract_class();
    let (token_addr, _) = token_class.deploy(@array![]).unwrap();

    let escrow_class = declare("AlmonerEscrow").unwrap().contract_class();
    let (escrow_addr, _) = escrow_class.deploy(@array![POOL().into()]).unwrap();

    if funding > 0 {
        IMockERC20MintDispatcher { contract_address: token_addr }.mint(escrow_addr, funding);
    }

    (
        IAlmonerEscrowDispatcher { contract_address: escrow_addr },
        IERC20Dispatcher { contract_address: token_addr },
    )
}

fn allocation(secret: felt252, token: ContractAddress, amount: u128, expiry: u64) -> Allocation {
    Allocation {
        commitment_hash: compute_commitment_hash(secret),
        token,
        amount,
        expiry,
        refund_recipient: PAYER_REFUND(),
    }
}

fn fund(escrow: IAlmonerEscrowDispatcher, allocations: Span<Allocation>) {
    start_cheat_caller_address(escrow.contract_address, POOL());
    escrow.privacy_invoke(EscrowOperation::Deposit, allocations, array![].span());
    stop_cheat_caller_address(escrow.contract_address);
}

// ---------------------------------------------------------------- deployment

#[test]
fn constructor_rejects_zero_pool() {
    let class = declare("AlmonerEscrow").unwrap().contract_class();
    // Asserted on the deploy result rather than with should_panic, because
    // `unwrap()` would replace the contract's panic data with its own.
    match class.deploy(@array![0]) {
        Result::Ok(_) => panic!("deploying with a zero pool address should revert"),
        Result::Err(panic_data) => assert!(*panic_data.at(0) == errors::ZERO_POOL),
    }
}

#[test]
fn constructor_pins_the_pool() {
    let (escrow, _) = setup(0);
    assert!(escrow.privacy_pool() == POOL());
}

// ------------------------------------------------------------------- funding

#[test]
fn fund_parks_an_allocation_and_credits_nothing() {
    let (escrow, token) = setup(100);
    let alloc = allocation(SECRET, token.contract_address, 100, EXPIRY);

    start_cheat_caller_address(escrow.contract_address, POOL());
    let credited = escrow
        .privacy_invoke(EscrowOperation::Deposit, array![alloc].span(), array![].span());
    stop_cheat_caller_address(escrow.contract_address);

    // Deposit parks funds, so the pool is told to credit nothing.
    assert!(credited.len() == 0);

    let entry = escrow.get_allocation(alloc.commitment_hash);
    assert!(entry.status == AllocationStatus::Funded);
    assert!(entry.amount == 100);
    assert!(entry.token == token.contract_address);
    assert!(escrow.get_outstanding(token.contract_address) == 100);
}

#[test]
fn fund_handles_a_batch() {
    let (escrow, token) = setup(300);
    let a = allocation(SECRET, token.contract_address, 100, EXPIRY);
    let b = allocation(OTHER_SECRET, token.contract_address, 200, EXPIRY);

    fund(escrow, array![a, b].span());

    assert!(escrow.get_outstanding(token.contract_address) == 300);
    assert!(escrow.get_allocation(a.commitment_hash).amount == 100);
    assert!(escrow.get_allocation(b.commitment_hash).amount == 200);
}

#[test]
#[should_panic(expected: 'CALLER_NOT_POOL')]
fn fund_rejects_a_caller_that_is_not_the_pool() {
    let (escrow, token) = setup(100);
    let alloc = allocation(SECRET, token.contract_address, 100, EXPIRY);

    start_cheat_caller_address(escrow.contract_address, STRANGER());
    escrow.privacy_invoke(EscrowOperation::Deposit, array![alloc].span(), array![].span());
}

#[test]
#[should_panic(expected: 'UNDERFUNDED')]
fn fund_rejects_a_batch_the_pool_did_not_cover() {
    // The safety invariant: allocating more than was delivered would let a batch
    // create claims payable out of other people's escrowed funds.
    let (escrow, token) = setup(50);
    let alloc = allocation(SECRET, token.contract_address, 100, EXPIRY);
    fund(escrow, array![alloc].span());
}

#[test]
#[should_panic(expected: 'UNDERFUNDED')]
fn fund_rejects_a_batch_that_overruns_partway_through() {
    let (escrow, token) = setup(150);
    let a = allocation(SECRET, token.contract_address, 100, EXPIRY);
    let b = allocation(OTHER_SECRET, token.contract_address, 100, EXPIRY);
    fund(escrow, array![a, b].span());
}

#[test]
#[should_panic(expected: 'COMMITMENT_EXISTS')]
fn fund_rejects_a_duplicate_commitment() {
    let (escrow, token) = setup(300);
    let alloc = allocation(SECRET, token.contract_address, 100, EXPIRY);
    fund(escrow, array![alloc].span());
    fund(escrow, array![alloc].span());
}

#[test]
#[should_panic(expected: 'ZERO_AMOUNT')]
fn fund_rejects_a_zero_amount() {
    let (escrow, token) = setup(100);
    let alloc = allocation(SECRET, token.contract_address, 0, EXPIRY);
    fund(escrow, array![alloc].span());
}

#[test]
#[should_panic(expected: 'ZERO_COMMITMENT')]
fn fund_rejects_a_zero_commitment() {
    let (escrow, token) = setup(100);
    let mut alloc = allocation(SECRET, token.contract_address, 100, EXPIRY);
    alloc.commitment_hash = 0;
    fund(escrow, array![alloc].span());
}

#[test]
#[should_panic(expected: 'ZERO_REFUND_RECIPIENT')]
fn fund_rejects_a_zero_refund_recipient() {
    let (escrow, token) = setup(100);
    let mut alloc = allocation(SECRET, token.contract_address, 100, EXPIRY);
    alloc.refund_recipient = 0.try_into().unwrap();
    fund(escrow, array![alloc].span());
}

#[test]
#[should_panic(expected: 'EMPTY_BATCH')]
fn fund_rejects_an_empty_batch() {
    let (escrow, _) = setup(100);
    fund(escrow, array![].span());
}

// ------------------------------------------------------------------ claiming

#[test]
fn claim_credits_an_open_note_and_approves_the_pool() {
    let (escrow, token) = setup(100);
    let alloc = allocation(SECRET, token.contract_address, 100, EXPIRY);
    fund(escrow, array![alloc].span());

    start_cheat_caller_address(escrow.contract_address, POOL());
    let credited = escrow
        .privacy_invoke(
            EscrowOperation::Claim,
            array![].span(),
            array![ClaimRequest { secret: SECRET, note_id: NOTE_ID }].span(),
        );
    stop_cheat_caller_address(escrow.contract_address);

    assert!(credited.len() == 1);
    let deposit = *credited.at(0);
    assert!(deposit.note_id == NOTE_ID);
    assert!(deposit.token == token.contract_address);
    assert!(deposit.amount == 100);

    // The pool pulls the tokens itself, so the escrow approves rather than transfers.
    assert!(token.allowance(escrow.contract_address, POOL()) == 100);
    assert!(token.balance_of(escrow.contract_address) == 100);

    assert!(escrow.get_allocation(alloc.commitment_hash).status == AllocationStatus::Claimed);
    assert!(escrow.get_outstanding(token.contract_address) == 0);
}

#[test]
fn claiming_the_same_token_twice_in_one_batch_accumulates_allowance() {
    // approve() overwrites, so a naive per-claim approve would leave the pool
    // able to pull only the last allocation's amount.
    let (escrow, token) = setup(300);
    let a = allocation(SECRET, token.contract_address, 100, EXPIRY);
    let b = allocation(OTHER_SECRET, token.contract_address, 200, EXPIRY);
    fund(escrow, array![a, b].span());

    start_cheat_caller_address(escrow.contract_address, POOL());
    let credited = escrow
        .privacy_invoke(
            EscrowOperation::Claim,
            array![].span(),
            array![
                ClaimRequest { secret: SECRET, note_id: NOTE_ID },
                ClaimRequest { secret: OTHER_SECRET, note_id: 'note-2' },
            ]
                .span(),
        );
    stop_cheat_caller_address(escrow.contract_address);

    assert!(credited.len() == 2);
    assert!(token.allowance(escrow.contract_address, POOL()) == 300);
    assert!(escrow.get_outstanding(token.contract_address) == 0);
}

#[test]
#[should_panic(expected: 'NOT_FUNDED')]
fn claim_rejects_an_unknown_secret() {
    let (escrow, token) = setup(100);
    fund(escrow, array![allocation(SECRET, token.contract_address, 100, EXPIRY)].span());

    start_cheat_caller_address(escrow.contract_address, POOL());
    escrow
        .privacy_invoke(
            EscrowOperation::Claim,
            array![].span(),
            array![ClaimRequest { secret: 'wrong', note_id: NOTE_ID }].span(),
        );
}

#[test]
#[should_panic(expected: 'NOT_FUNDED')]
fn claim_rejects_a_second_claim() {
    let (escrow, token) = setup(100);
    fund(escrow, array![allocation(SECRET, token.contract_address, 100, EXPIRY)].span());

    let claims = array![ClaimRequest { secret: SECRET, note_id: NOTE_ID }].span();
    start_cheat_caller_address(escrow.contract_address, POOL());
    escrow.privacy_invoke(EscrowOperation::Claim, array![].span(), claims);
    escrow.privacy_invoke(EscrowOperation::Claim, array![].span(), claims);
}

#[test]
#[should_panic(expected: 'EXPIRED')]
fn claim_rejects_an_expired_allocation() {
    let (escrow, token) = setup(100);
    fund(escrow, array![allocation(SECRET, token.contract_address, 100, EXPIRY)].span());

    start_cheat_block_timestamp_global(EXPIRY);
    start_cheat_caller_address(escrow.contract_address, POOL());
    escrow
        .privacy_invoke(
            EscrowOperation::Claim,
            array![].span(),
            array![ClaimRequest { secret: SECRET, note_id: NOTE_ID }].span(),
        );
}

#[test]
fn an_allocation_with_no_expiry_stays_claimable() {
    let (escrow, token) = setup(100);
    fund(escrow, array![allocation(SECRET, token.contract_address, 100, 0)].span());

    start_cheat_block_timestamp_global(999_999);
    start_cheat_caller_address(escrow.contract_address, POOL());
    let credited = escrow
        .privacy_invoke(
            EscrowOperation::Claim,
            array![].span(),
            array![ClaimRequest { secret: SECRET, note_id: NOTE_ID }].span(),
        );
    assert!(credited.len() == 1);
}

#[test]
#[should_panic(expected: 'CALLER_NOT_POOL')]
fn claim_rejects_a_caller_that_is_not_the_pool() {
    let (escrow, token) = setup(100);
    fund(escrow, array![allocation(SECRET, token.contract_address, 100, EXPIRY)].span());

    start_cheat_caller_address(escrow.contract_address, STRANGER());
    escrow
        .privacy_invoke(
            EscrowOperation::Claim,
            array![].span(),
            array![ClaimRequest { secret: SECRET, note_id: NOTE_ID }].span(),
        );
}

// ------------------------------------------------------------------ refunding

#[test]
fn refund_returns_an_expired_allocation_to_the_payer() {
    let (escrow, token) = setup(100);
    let alloc = allocation(SECRET, token.contract_address, 100, EXPIRY);
    fund(escrow, array![alloc].span());

    start_cheat_block_timestamp_global(EXPIRY);
    // Permissionless on purpose: a keeper sweeps on a schedule, and funds can
    // only reach the recipient fixed at funding time.
    start_cheat_caller_address(escrow.contract_address, STRANGER());
    escrow.refund(alloc.commitment_hash);
    stop_cheat_caller_address(escrow.contract_address);

    assert!(token.balance_of(PAYER_REFUND()) == 100);
    assert!(token.balance_of(escrow.contract_address) == 0);
    assert!(escrow.get_allocation(alloc.commitment_hash).status == AllocationStatus::Refunded);
    assert!(escrow.get_outstanding(token.contract_address) == 0);
}

#[test]
#[should_panic(expected: 'NOT_YET_EXPIRED')]
fn refund_rejects_an_allocation_that_has_not_expired() {
    let (escrow, token) = setup(100);
    let alloc = allocation(SECRET, token.contract_address, 100, EXPIRY);
    fund(escrow, array![alloc].span());

    start_cheat_block_timestamp_global(EXPIRY - 1);
    escrow.refund(alloc.commitment_hash);
}

#[test]
#[should_panic(expected: 'NO_EXPIRY')]
fn refund_rejects_an_allocation_with_no_expiry() {
    let (escrow, token) = setup(100);
    let alloc = allocation(SECRET, token.contract_address, 100, 0);
    fund(escrow, array![alloc].span());

    start_cheat_block_timestamp_global(999_999);
    escrow.refund(alloc.commitment_hash);
}

#[test]
#[should_panic(expected: 'NOT_FUNDED')]
fn refund_rejects_a_second_refund() {
    let (escrow, token) = setup(100);
    let alloc = allocation(SECRET, token.contract_address, 100, EXPIRY);
    fund(escrow, array![alloc].span());

    start_cheat_block_timestamp_global(EXPIRY);
    escrow.refund(alloc.commitment_hash);
    escrow.refund(alloc.commitment_hash);
}

#[test]
#[should_panic(expected: 'NOT_FUNDED')]
fn a_claimed_allocation_cannot_be_refunded() {
    let (escrow, token) = setup(100);
    let alloc = allocation(SECRET, token.contract_address, 100, EXPIRY);
    fund(escrow, array![alloc].span());

    start_cheat_caller_address(escrow.contract_address, POOL());
    escrow
        .privacy_invoke(
            EscrowOperation::Claim,
            array![].span(),
            array![ClaimRequest { secret: SECRET, note_id: NOTE_ID }].span(),
        );
    stop_cheat_caller_address(escrow.contract_address);

    start_cheat_block_timestamp_global(EXPIRY);
    escrow.refund(alloc.commitment_hash);
}

#[test]
fn refund_batch_sweeps_many_at_once() {
    let (escrow, token) = setup(300);
    let a = allocation(SECRET, token.contract_address, 100, EXPIRY);
    let b = allocation(OTHER_SECRET, token.contract_address, 200, EXPIRY);
    fund(escrow, array![a, b].span());

    start_cheat_block_timestamp_global(EXPIRY);
    escrow.refund_batch(array![a.commitment_hash, b.commitment_hash].span());

    assert!(token.balance_of(PAYER_REFUND()) == 300);
    assert!(escrow.get_outstanding(token.contract_address) == 0);
}

// -------------------------------------------------------------- commitments

/// Cross-language parity with the TypeScript client.
///
/// If this constant and `computeCommitmentHash` in `@almoner/core` ever drift,
/// every claim link issued becomes unredeemable: the payer commits to one hash
/// and the recipient proves a preimage of another. The same vector is asserted
/// in the TypeScript test suite.
#[test]
fn commitment_hash_matches_the_typescript_client() {
    assert!(
        compute_commitment_hash(
            'secret-one',
        ) == 0x1c43a7fcd994cb13b1375f6d4bc28e03bb50f244905f9e1410664958a93712f,
    );
}

#[test]
fn commitment_hashes_are_domain_separated_and_distinct() {
    assert!(compute_commitment_hash(SECRET) != compute_commitment_hash(OTHER_SECRET));
    assert!(compute_commitment_hash(SECRET) != core::poseidon::poseidon_hash_span([SECRET].span()));
}

// ------------------------------------------- calldata parity with the client

/// The pool deserializes invoke calldata straight into `privacy_invoke`'s
/// parameters. These vectors are the literal output of `buildFundActions` and
/// `buildClaimActions` in `@almoner/core`, so a shape mismatch between the
/// TypeScript encoder and this signature fails here rather than on mainnet after
/// the payer has signed.
///
/// Regenerate with the snippet in `docs/CALLDATA-VECTORS.md` if the signature changes.
#[test]
fn deposit_calldata_from_the_typescript_builder_deserializes() {
    let mut calldata = array![
        0x0, // EscrowOperation::Deposit
        0x2, // allocations.len()
        0x3a3153641129c026fb3d2c10762a45780b9806c8bec9407b3431143a6f0c587, 0xaaa, 0x64, 0x6553f100,
        0xfee, 0x3eeb95578202a78f3c5553a8c75fe7154d2d609801954a0d2708c6e224859a1, 0xaaa, 0xfa,
        0x6553f100, 0xfee, 0x0 // claims.len()
    ]
        .span();

    let operation: EscrowOperation = Serde::deserialize(ref calldata).unwrap();
    let allocations: Span<Allocation> = Serde::deserialize(ref calldata).unwrap();
    let claims: Span<ClaimRequest> = Serde::deserialize(ref calldata).unwrap();

    // Trailing garbage makes the pool reject the call, so the vector must be
    // consumed exactly.
    assert!(calldata.is_empty(), "calldata not fully consumed");

    assert!(operation == EscrowOperation::Deposit);
    assert!(claims.len() == 0);
    assert!(allocations.len() == 2);

    let first = *allocations.at(0);
    assert!(
        first.commitment_hash == 0x3a3153641129c026fb3d2c10762a45780b9806c8bec9407b3431143a6f0c587,
    );
    assert!(first.amount == 100);
    assert!(first.expiry == 1700000000);
    assert!(first.refund_recipient == 0xfee.try_into().unwrap());

    let second = *allocations.at(1);
    assert!(second.amount == 250);
}

#[test]
fn claim_calldata_from_the_typescript_builder_deserializes() {
    // `${openNoteIds[N]}` placeholders stand where the wallet substitutes real
    // note ids; 0x9 and 0xa stand in for them here.
    let mut calldata = array![
        0x1, // EscrowOperation::Claim
        0x0, // allocations.len()
        0x2, // claims.len()
        0x1,
        0x9, // secret, note_id
        0x2, 0xa,
    ]
        .span();

    let operation: EscrowOperation = Serde::deserialize(ref calldata).unwrap();
    let allocations: Span<Allocation> = Serde::deserialize(ref calldata).unwrap();
    let claims: Span<ClaimRequest> = Serde::deserialize(ref calldata).unwrap();

    assert!(calldata.is_empty(), "calldata not fully consumed");
    assert!(operation == EscrowOperation::Claim);
    assert!(allocations.len() == 0);
    assert!(claims.len() == 2);
    assert!(*claims.at(0) == ClaimRequest { secret: 0x1, note_id: 0x9 });
    assert!(*claims.at(1) == ClaimRequest { secret: 0x2, note_id: 0xa });
}

/// The commitments in the deposit vector are what `computeCommitmentHash`
/// produced for secrets 0x1 and 0x2, so the client's hashing is pinned from the
/// contract side too.
#[test]
fn deposit_vector_commitments_match_the_client_hashes() {
    assert!(
        compute_commitment_hash(
            0x1,
        ) == 0x3a3153641129c026fb3d2c10762a45780b9806c8bec9407b3431143a6f0c587,
    );
    assert!(
        compute_commitment_hash(
            0x2,
        ) == 0x3eeb95578202a78f3c5553a8c75fe7154d2d609801954a0d2708c6e224859a1,
    );
}
