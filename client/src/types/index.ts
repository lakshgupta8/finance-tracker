export type Account = {
    id: number;
    name: string;
    balance: number;
    icon: string;
};

export type Transaction = {
    id: number;
    title: string;
    amount: number;
    category: string;
    date_added?: string;
};
