export {
  detectStrk20Support,
  describeStrk20Support,
  STRK20_MIN_WALLET_API,
  type DetectOptions,
  type Strk20Support,
  type Strk20SupportReason,
  type Strk20CapableWallet,
  type AnyWalletStandardWallet,
} from "./detect.js";

export { compareWalletApiVersion, satisfiesMinimum, highestVersion } from "./version.js";
