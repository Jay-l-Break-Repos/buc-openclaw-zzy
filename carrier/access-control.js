/**
 * VULNERABLE VERSION - OpenClaw Twitch Access Control
 * This demonstrates GHSA-33rq-m5x2-fvgf
 * 
 * The vulnerability: allowFrom check doesn't return false for non-matching users,
 * causing execution to fall through to allowedRoles check, which defaults to allow.
 */

/**
 * Check if a Twitch message should be allowed based on account configuration
 */
export function checkTwitchAccessControl(params) {
  const { message, account, botUsername } = params;

  if (account.requireMention ?? true) {
    const mentions = extractMentions(message.message);
    if (!mentions.includes(botUsername.toLowerCase())) {
      return {
        allowed: false,
        reason: "message does not mention the bot (requireMention is enabled)",
      };
    }
  }

  if (account.allowFrom && account.allowFrom.length > 0) {
    const allowFrom = account.allowFrom;
    const senderId = message.userId;

    if (!senderId) {
      return {
        allowed: false,
        reason: "sender user ID not available for allowlist check",
      };
    }

    if (allowFrom.includes(senderId)) {
      return {
        allowed: true,
        matchKey: senderId,
        matchSource: "allowlist",
      };
    }

    // VULNERABILITY: Missing early return here - execution falls through to allowedRoles check
    // The fix would be: return { allowed: false, reason: "sender is not in allowFrom allowlist" };
  }

  if (account.allowedRoles && account.allowedRoles.length > 0) {
    const allowedRoles = account.allowedRoles;

    // "all" grants access to everyone
    if (allowedRoles.includes("all")) {
      return {
        allowed: true,
        matchKey: "all",
        matchSource: "role",
      };
    }

    const hasAllowedRole = checkSenderRoles({
      message,
      allowedRoles,
    });

    if (!hasAllowedRole) {
      return {
        allowed: false,
        reason: `sender does not have any of the required roles: ${allowedRoles.join(", ")}`,
      };
    }

    return {
      allowed: true,
      matchKey: allowedRoles.join(","),
      matchSource: "role",
    };
  }

  // DEFAULT ALLOW - this is reached when allowFrom is set but allowedRoles is not
  return {
    allowed: true,
  };
}

/**
 * Check if the sender has any of the allowed roles
 */
function checkSenderRoles(params) {
  const { message, allowedRoles } = params;
  const { isMod, isOwner, isVip, isSub } = message;

  for (const role of allowedRoles) {
    switch (role) {
      case "moderator":
        if (isMod) {
          return true;
        }
        break;
      case "owner":
        if (isOwner) {
          return true;
        }
        break;
      case "vip":
        if (isVip) {
          return true;
        }
        break;
      case "subscriber":
        if (isSub) {
          return true;
        }
        break;
    }
  }

  return false;
}

/**
 * Extract @mentions from a Twitch chat message
 */
export function extractMentions(message) {
  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;

  while ((match = mentionRegex.exec(message)) !== null) {
    const username = match[1];
    if (username) {
      mentions.push(username.toLowerCase());
    }
  }

  return mentions;
}