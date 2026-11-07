import { z } from "zod";

export enum PlatformId {
  INSTAGRAM = "instagram",
  FACEBOOK = "facebook",
  REDDIT = "reddit",
  X = "x",
  YOUTUBE = "youtube",
}

export const platformIdSchema = z.enum(PlatformId);
