import type { AccessAction } from "../../../core/domain/identity/access-policy.js";

export type CommandKind =
  | "system_health"
  | "admin_mode_activate"
  | "admin_write"
  | "start"
  | "pending_access_requests"
  | "approve_access_request"
  | "reject_access_request"
  | "family_message";

export interface CommandRoute {
  readonly kind: CommandKind;
  readonly action: AccessAction;
  readonly normalizedText: string;
}

export function routeCommand(text: string): CommandRoute {
  const normalizedText = text.trim();
  const comparable = normalizedText.toLowerCase();

  if (isSystemHealthCommand(comparable)) {
    return {
      kind: "system_health",
      action: "owner_read",
      normalizedText
    };
  }

  if (comparable === "/admin" || comparable === "admin") {
    return {
      kind: "admin_mode_activate",
      action: "owner_read",
      normalizedText
    };
  }

  if (comparable === "/start" || comparable === "start") {
    return {
      kind: "start",
      action: "family_read",
      normalizedText
    };
  }

  if (comparable === "/pending" || comparable === "pending") {
    return {
      kind: "pending_access_requests",
      action: "owner_read",
      normalizedText
    };
  }

  if (comparable.startsWith("/approve ")) {
    return {
      kind: "approve_access_request",
      action: "owner_read",
      normalizedText
    };
  }

  if (comparable.startsWith("/reject ")) {
    return {
      kind: "reject_access_request",
      action: "owner_read",
      normalizedText
    };
  }

  if (isAdminWriteCommand(comparable)) {
    return {
      kind: "admin_write",
      action: "admin_write",
      normalizedText
    };
  }

  return {
    kind: "family_message",
    action: "family_read",
    normalizedText
  };
}

function isSystemHealthCommand(text: string): boolean {
  return text === "/health" || text === "health" || text === "status";
}

function isAdminWriteCommand(text: string): boolean {
  return text.startsWith("/restart") || text.startsWith("/stop");
}
