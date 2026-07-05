import type {
  IdentityAccessRepositoryPort,
  PendingAccessRequest
} from "../../../ports/identity-access-repository-port.js";

export class ListPendingAccessRequestsUseCase {
  constructor(
    private readonly dependencies: {
      readonly repository: Pick<
        IdentityAccessRepositoryPort,
        "listPendingAccessRequests"
      >;
    }
  ) {}

  execute(): Promise<readonly PendingAccessRequest[]> {
    return this.dependencies.repository.listPendingAccessRequests();
  }
}
