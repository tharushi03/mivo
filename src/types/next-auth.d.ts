import type { DefaultSession } from "next-auth";

type Role = "ADMIN" | "SELLER" | "BUYER";

declare module "next-auth" {
  interface User {
    role: Role;
    /** When the password was last changed (ms), at login time. */
    pwdAt?: number;
  }
  interface Session {
    user: { id: string; role: Role; pwdAt: number } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    pwdAt?: number;
  }
}
