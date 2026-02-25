import React from "react";

export type RoleType = "broadcaster" | "moderator" | "vip" | "subscriber" | "founder" | "prime" | "staff" | "verified";

type RoleBadgeProps = {
  role: RoleType;
  size?: "sm" | "md";
};

const ROLE_CONFIG: Record<RoleType, { label: string; icon: string; color: string; bgColor: string }> = {
  broadcaster: {
    label: "Broadcaster",
    icon: "🎬",
    color: "#ff4444",
    bgColor: "rgba(255, 68, 68, 0.15)"
  },
  moderator: {
    label: "Moderator",
    icon: "⚔️",
    color: "#00d26a",
    bgColor: "rgba(0, 210, 106, 0.15)"
  },
  vip: {
    label: "VIP",
    icon: "💎",
    color: "#e91e8c",
    bgColor: "rgba(233, 30, 140, 0.15)"
  },
  subscriber: {
    label: "Subscriber",
    icon: "⭐",
    color: "#9146ff",
    bgColor: "rgba(145, 70, 255, 0.15)"
  },
  founder: {
    label: "Founder",
    icon: "🏆",
    color: "#ffd700",
    bgColor: "rgba(255, 215, 0, 0.15)"
  },
  prime: {
    label: "Prime",
    icon: "👑",
    color: "#00aaff",
    bgColor: "rgba(0, 170, 255, 0.15)"
  },
  staff: {
    label: "Staff",
    icon: "🛡️",
    color: "#60a5fa",
    bgColor: "rgba(96, 165, 250, 0.15)"
  },
  verified: {
    label: "Verified",
    icon: "✅",
    color: "#22c55e",
    bgColor: "rgba(34, 197, 94, 0.15)"
  }
};

export function RoleBadge({ role, size = "sm" }: RoleBadgeProps) {
  const config = ROLE_CONFIG[role];
  if (!config) return null;

  return (
    <span
      className={`role-badge role-badge--${role} role-badge--${size}`}
      style={
        {
          "--badge-color": config.color,
          "--badge-bg": config.bgColor
        } as React.CSSProperties
      }
      title={config.label}
    >
      <span className="role-badge__icon">{config.icon}</span>
      {size === "md" ? <span className="role-badge__label">{config.label}</span> : null}
    </span>
  );
}

export default RoleBadge;
