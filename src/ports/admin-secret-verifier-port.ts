export interface AdminSecretVerifierPort {
  verifyAdminSecret(secret: string): Promise<boolean>;
}
