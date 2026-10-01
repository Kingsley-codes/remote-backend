import axios from "axios";

interface PaystackBank {
  id: number;
  name: string;
  code: string;
  active?: boolean;
  is_deleted?: boolean;
}

const BANK_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let bankCache: { banks: PaystackBank[]; expiresAt: number } | null = null;
let bankFetchPromise: Promise<PaystackBank[]> | null = null;

export const fetchNigerianBanks = async (): Promise<PaystackBank[]> => {
  if (bankCache && bankCache.expiresAt > Date.now()) return bankCache.banks;
  if (bankFetchPromise) return bankFetchPromise;

  bankFetchPromise = (async () => {
    const banks: PaystackBank[] = [];
    const seenCursors = new Set<string>();
    let next: string | undefined;

    do {
      const response = await axios.get("https://api.paystack.co/bank", {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
        params: {
          country: "nigeria",
          currency: "NGN",
          type: "nuban",
          perPage: 100,
          use_cursor: true,
          ...(next ? { next } : {}),
        },
      });

      banks.push(...(response.data.data ?? []));
      const nextCursor = response.data.meta?.next as string | undefined;
      if (!nextCursor || seenCursors.has(nextCursor)) break;
      seenCursors.add(nextCursor);
      next = nextCursor;
    } while (next);

    const uniqueBanks = Array.from(
      new Map(
        banks
          .filter((bank) => bank.active !== false && bank.is_deleted !== true)
          .map((bank) => [bank.code, bank]),
      ).values(),
    ).sort((a, b) => a.name.localeCompare(b.name));

    bankCache = {
      banks: uniqueBanks,
      expiresAt: Date.now() + BANK_CACHE_TTL_MS,
    };
    return uniqueBanks;
  })().finally(() => {
    bankFetchPromise = null;
  });

  return bankFetchPromise;
};


export async function resolveBankName(code: string) {
  const bank = (await fetchNigerianBanks()).find(bank => bank.code === code);
  if (!bank) throw new Error("Select a valid bank");
  return bank.name;
}
