import type { Collection } from "mongodb";
import type { AccountDocument, AccountStore } from "./contracts.js";

export class AccountRepository implements AccountStore {
    public constructor(private readonly accounts: Collection<AccountDocument>) {}

    public async ensureIndexes(): Promise<void> {
        await this.accounts.createIndexes([
            { key: { loginId: 1 }, unique: true, name: "unique_login_id" },
            { key: { accountId: 1 }, unique: true, name: "unique_account_id" }
        ]);
    }

    public findByLoginId(loginId: string): Promise<AccountDocument | null> {
        return this.accounts.findOne({ loginId }, { maxTimeMS: 2000 });
    }

    public findByAccountId(accountId: string): Promise<AccountDocument | null> {
        return this.accounts.findOne({ accountId }, { maxTimeMS: 2000 });
    }

    public async create(account: AccountDocument): Promise<void> {
        await this.accounts.insertOne(account);
    }
}
