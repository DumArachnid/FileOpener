declare global {
  namespace Express {
    interface Request {
      studyDeskUser?: {
        id: number;
        username: string;
        role: "user" | "moderator" | "dev";
        bannedAt: Date | null;
      };
      studyDeskSessionHash?: string;
      replitDeveloper?: {
        id: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
        profileImageUrl: string | null;
      };
      replitDeveloperSessionId?: string;
    }
  }
}

export {};
