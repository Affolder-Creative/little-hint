import type { Invitation } from "./model";

export const isAccountInvitation = (invitation: Invitation): boolean =>
  !!invitation.invitedById && !invitation.groupId && !invitation.bootstrap;

export const invitationIsPending = (invitation: Invitation): boolean =>
  !invitation.revoked &&
  !invitation.acceptedBy &&
  Date.parse(invitation.expiresAt) > Date.now();
