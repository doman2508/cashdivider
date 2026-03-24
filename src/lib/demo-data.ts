export const demoUser = {
  id: "demo-user",
  email: "demo@cashdivider.local",
};

export const demoRules = [
  {
    id: "rule-tax",
    name: "Podatki",
    percentage: 30,
    targetLabel: "Konto podatkowe",
    targetAccountNumber: "11 1111 1111 1111 1111 1111 1111",
  },
  {
    id: "rule-fixed",
    name: "Koszty stale",
    percentage: 20,
    targetLabel: "Konto firmowe",
    targetAccountNumber: "22 2222 2222 2222 2222 2222 2222",
  },
  {
    id: "rule-savings",
    name: "Oszczednosci",
    percentage: 10,
    targetLabel: "Poduszka finansowa",
    targetAccountNumber: "33 3333 3333 3333 3333 3333 3333",
  },
];

export const demoDay = {
  date: "2026-03-23",
  totalIncome: 1500,
  status: "OPEN",
  payments: [
    {
      id: "payment-tax",
      targetLabel: "Konto podatkowe",
      targetAccountNumber: "11 1111 1111 1111 1111 1111 1111",
      amount: 450,
      categoryName: "Podatki",
    },
    {
      id: "payment-fixed",
      targetLabel: "Konto firmowe",
      targetAccountNumber: "22 2222 2222 2222 2222 2222 2222",
      amount: 300,
      categoryName: "Koszty stale",
    },
    {
      id: "payment-savings",
      targetLabel: "Poduszka finansowa",
      targetAccountNumber: "33 3333 3333 3333 3333 3333 3333",
      amount: 150,
      categoryName: "Oszczednosci",
    },
  ],
  leftoverAmount: 600,
  transactions: [
    { id: "txn-1", amount: 250, description: "Monika Goralczyk - P.BLIK" },
    { id: "txn-2", amount: 250, description: "Bartosz Kolota - konsultacje" },
    { id: "txn-3", amount: 250, description: "Aleksandra Swies - przelew srodkow" },
    { id: "txn-4", amount: 500, description: "Aleksandra Zybert - 11.03 i 23.03.2026" },
    { id: "txn-5", amount: 250, description: "Kamil Majewski - Sesja" },
  ],
};
