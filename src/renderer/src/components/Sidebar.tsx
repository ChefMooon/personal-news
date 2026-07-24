import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Bookmark,
  Terminal,
  Settings,
  ChevronLeft,
  ChevronRight,
  Youtube,
  Newspaper,
  Trophy,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useScripts } from "../hooks/useScripts";
import { useSidebarConfig } from "../hooks/useSidebarConfig";
import { useRedditDigestEnabled } from "../contexts/RedditDigestEnabledContext";
import { useSavedPostsEnabled } from "../contexts/SavedPostsEnabledContext";
import { useSportsEnabled } from "../contexts/SportsEnabledContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import type { SidebarItemId } from "../../../shared/ipc-types";

interface NavItem {
  id: SidebarItemId;
  to: string;
  label: string;
  icon: React.ReactNode;
  attention?: boolean;
}

function SidebarNavLink({
  to,
  label,
  icon,
  collapsed,
  attention = false,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  collapsed: boolean;
  attention?: boolean;
}): React.ReactElement {
  const navLink = (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "mx-1 flex items-center rounded-md py-2 text-sm transition-colors",
          collapsed ? "h-10 w-10 justify-center mx-auto pl-0.5" : "mx-1 gap-3 px-3 py-2",
          isActive
            ? "bg-primary text-primary-foreground"
            : attention
              ? "bg-amber-500/10 text-muted-foreground hover:bg-amber-500/20 hover:text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )
      }
    >
      {icon}
      {!collapsed && (
        <span className="flex-1 truncate transition-opacity duration-150">
          {label}
        </span>
      )}
    </NavLink>
  );

  if (!collapsed) {
    return navLink;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{navLink}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar(): React.ReactElement {
  const { scripts } = useScripts();
  const hasStaleScripts = scripts.some((s) => s.is_stale);
  const { config, setCollapsed } = useSidebarConfig();
  const collapsed = config.collapsed;
  const { enabled: redditDigestEnabled } = useRedditDigestEnabled();
  const { enabled: savedPostsEnabled } = useSavedPostsEnabled();
  const { enabled: sportsEnabled } = useSportsEnabled();

  const allNavItems: NavItem[] = [
    {
      id: "dashboard",
      to: "/",
      label: "Dashboard",
      icon: <LayoutDashboard className="h-5 w-5 shrink-0" />,
    },
    {
      id: "youtube",
      to: "/youtube",
      label: "YouTube",
      icon: <Youtube className="h-5 w-5 shrink-0" />,
    },
    {
      id: "reddit-digest",
      to: "/reddit-digest",
      label: "Reddit Digest",
      icon: <Newspaper className="h-5 w-5 shrink-0" />,
    },
    {
      id: "saved-posts",
      to: "/saved-posts",
      label: "Saved Posts",
      icon: <Bookmark className="h-5 w-5 shrink-0" />,
    },
    {
      id: "sports",
      to: "/sports",
      label: "Sports",
      icon: <Trophy className="h-5 w-5 shrink-0" />,
    },
    {
      id: "scripts",
      to: "/scripts",
      label: "Script Manager",
      icon: <Terminal className="h-5 w-5 shrink-0" />,
      attention: hasStaleScripts,
    },
  ];

  const availableItemIds = new Set<SidebarItemId>([
    "dashboard",
    "youtube",
    "scripts",
    ...(redditDigestEnabled ? ["reddit-digest" as const] : []),
    ...(savedPostsEnabled ? ["saved-posts" as const] : []),
    ...(sportsEnabled ? ["sports" as const] : []),
  ]);
  const hiddenItemIds = new Set(config.hiddenItemIds);
  const navItems = config.itemOrder
    .map((itemId) => allNavItems.find((item) => item.id === itemId))
    .filter((item): item is NavItem => item != null)
    .filter(
      (item) => availableItemIds.has(item.id) && !hiddenItemIds.has(item.id),
    );

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden border-r bg-card transition-[width] duration-200 ease-out",
        collapsed ? "w-14" : "w-[200px]",
      )}
      style={{ flexShrink: 0 }}
    >
      <div
        className={cn(
          "flex items-center border-b px-2 py-1.5",
          collapsed ? "justify-center" : "justify-end",
        )}
      >
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5 shrink-0" />
          ) : (
            <ChevronLeft className="h-5 w-5 shrink-0" />
          )}
        </button>
      </div>

      <TooltipProvider delayDuration={120} skipDelayDuration={0}>
        {/* Nav items */}
        <nav className="flex-1 py-2">
          {navItems.map((item) => (
            <SidebarNavLink
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              collapsed={collapsed}
              attention={item.attention}
            />
          ))}
        </nav>

        <div className="border-t py-2">
          <SidebarNavLink
            to="/settings"
            label="Settings"
            icon={<Settings className="h-5 w-5 shrink-0" />}
            collapsed={collapsed}
          />
        </div>
      </TooltipProvider>
    </div>
  );
}
