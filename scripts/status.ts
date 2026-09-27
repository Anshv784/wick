// Prints a one-screen snapshot of every Wick account on devnet.
import { PublicKey } from "@solana/web3.js";
import { conn, markets, marketsEr, readDeployment, sealed } from "./lib";

const DELEGATION = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
const key = (o: object) => Object.keys(o)[0];

(async () => {
  const d = readDeployment();
  for (const s of d.markets) {
    const k = new PublicKey(s);
    const onEr = (await conn.getAccountInfo(k))!.owner.equals(DELEGATION);
    const m = await (onEr ? marketsEr : markets).account.market.fetch(k);
    console.log(
      s.slice(0, 6), Buffer.from(m.symbol).toString().replace(/\0/g, ""), `≥${m.strike.toNumber() / 1e8}`,
      key(m.status), onEr ? "ER" : "base", `yes=${m.noReserve.toNumber() / (m.yesReserve.toNumber() + m.noReserve.toNumber())}`,
      `vol=${m.volume.toNumber() / 1e6}`, m.settlePyth.toNumber() ? `pyth=${m.settlePyth.toNumber() / 1e8} sb=${m.settleSb.toNumber() / 1e8}` : "",
    );
  }
  for (const b of await sealed.account.sealedBatch.all([{ dataSize: sealed.account.sealedBatch.size }]))
    console.log("batch", b.publicKey.toBase58().slice(0, 6), key(b.account.state), "orders", b.account.orderCount, "busy", b.account.busySince.toNumber(), "yes", b.account.yesTotal.toNumber(), "no", b.account.noTotal.toNumber());
  for (const t of await markets.account.touchTicket.all([{ dataSize: markets.account.touchTicket.size }]))
    console.log("ticket", t.publicKey.toBase58().slice(0, 6), key(t.account.kind), t.account.barrier.toNumber() / 1e8, key(t.account.status), t.account.payout.toNumber() / 1e6);
})();
