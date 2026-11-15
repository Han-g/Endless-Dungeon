import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import { MongoClient, MongoServerError } from "mongodb";
import type { AccountDocument } from "./contracts.js";
import { normalizeLoginId, requirePassword } from "./contracts.js";
import { readAuthConfig } from "./config.js";
import { hashPassword } from "./password.js";
import { AccountRepository } from "./AccountRepository.js";

async function readHiddenPassword(): Promise<string> {
    let muted = false;
    const output = new Writable({
        write(chunk, _encoding, callback) {
            if (!muted) process.stdout.write(chunk);
            callback();
        }
    });
    const terminal = createInterface({ input: process.stdin, output, terminal: true });
    try {
        const answer = terminal.question("비밀번호 (8~128자, 입력 숨김): ");
        muted = true;
        return await answer;
    } finally {
        muted = false;
        terminal.close();
        output.end();
        process.stdout.write("\n");
    }
}

async function main(): Promise<void> {
    if (!process.stdin.isTTY) throw new Error("Run this command in an interactive WSL terminal.");
    const envFile = [".env." + (process.env.NODE_ENV ?? "development"), ".env"]
        .find(file => existsSync(file));
    if (envFile) loadEnvFile(envFile);
    const config = readAuthConfig();
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    let loginId: string;
    let displayName: string;
    try {
        loginId = normalizeLoginId(await terminal.question("로그인 아이디: "));
        displayName = (await terminal.question("표시 이름 (1~24자): ")).trim();
    } finally {
        terminal.close();
    }
    if (displayName.length < 1 || displayName.length > 24 || /[\u0000-\u001f]/.test(displayName)) {
        throw new Error("표시 이름은 제어 문자 없이 1~24자여야 합니다.");
    }
    const password = requirePassword(await readHiddenPassword());
    const mongodb = new MongoClient(config.mongodbUri, { serverSelectionTimeoutMS: 3000 });
    try {
        await mongodb.connect();
        const accounts = new AccountRepository(
            mongodb.db(config.mongodbDatabase).collection<AccountDocument>("accounts")
        );
        await accounts.ensureIndexes();
        await accounts.create({
            accountId: randomUUID(), loginId, displayName,
            passwordHash: await hashPassword(password),
            selectedCharacterId: 1, status: "active", createdAt: new Date()
        });
        console.info("계정을 생성했습니다. Unity에서 입력한 아이디로 로그인하세요.");
    } finally {
        await mongodb.close();
    }
}

void main().catch(error => {
    if (error instanceof MongoServerError && error.code === 11000) {
        console.error("이미 존재하는 계정입니다. 기존 계정은 변경하지 않았습니다.");
    } else {
        console.error(error instanceof Error && !error.name.startsWith("Mongo")
            ? error.message : "계정 생성에 실패했습니다. DB 연결을 확인하세요.");
    }
    process.exitCode = 1;
});
