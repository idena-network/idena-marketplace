import {bufferToHex, ecrecover, fromRpcSig, keccak256, pubToAddress} from 'ethereumjs-util'

export function getAddrFromSignature(data, signature) {
  const hash = keccak256(Buffer.from(data))
  const {v, r, s} = fromRpcSig(signature)
  const pubKey = ecrecover(hash, v, r, s)
  const addrBuf = pubToAddress(pubKey)
  const addr = bufferToHex(addrBuf)
  return addr
}
