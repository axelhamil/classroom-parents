import type { AppError, Result } from "@packages/ddd-kit";
import type { UserDataSnapshot } from "../dto/user-data-export.dto";

export interface IUserDataReader {
  collect(userId: string): Promise<Result<UserDataSnapshot, AppError>>;
}
