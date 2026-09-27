export type AssetSymbol = "SOL" | "BTC" | "ETH";

export type Asset = {
  symbol: AssetSymbol;
  name: string;
  pythFeedId: string;
  pythSymbol: string;
  color: string;
};

export const ASSETS: Record<AssetSymbol, Asset> = {
  SOL: {
    symbol: "SOL",
    name: "Solana",
    pythFeedId: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    pythSymbol: "Crypto.SOL/USD",
    color: "#b79cff",
  },
  BTC: {
    symbol: "BTC",
    name: "Bitcoin",
    pythFeedId: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    pythSymbol: "Crypto.BTC/USD",
    color: "#ffb266",
  },
  ETH: {
    symbol: "ETH",
    name: "Ethereum",
    pythFeedId: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    pythSymbol: "Crypto.ETH/USD",
    color: "#8ab4ff",
  },
};

export function assetFromBytes(bytes: number[] | Uint8Array): Asset | undefined {
  const s = new TextDecoder().decode(Uint8Array.from(bytes)).replace(/\0/g, "").trim();
  return ASSETS[s as AssetSymbol];
}
