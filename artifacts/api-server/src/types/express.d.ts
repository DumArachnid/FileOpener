declare global {
  namespace Express {
    interface Request {
      studyDeskUser?: {
        id: number;
        username: string;
        role: "user" | "moderator";
        bannedAt: Date | null;
      };
      studyDeskSessionHash?: string;
    }
  }
}

export {};
