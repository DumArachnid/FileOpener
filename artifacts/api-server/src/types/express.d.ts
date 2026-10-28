declare global {
  namespace Express {
    interface Request {
      studyDeskUser?: { id: number; username: string };
      studyDeskSessionHash?: string;
    }
  }
}

export {};
