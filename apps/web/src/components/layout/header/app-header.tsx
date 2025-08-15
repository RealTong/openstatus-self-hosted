"use client";

import { Skeleton } from "@openstatus/ui";

import { Shell } from "@/components/dashboard/shell";
import { useCookieState } from "@/hooks/use-cookie-state";
import { AppTabs } from "./app-tabs";
import { Breadcrumbs } from "./breadcrumbs";
import { UserNav } from "./user-nav";

export function AppHeader() {
  const [lastViewed, setLastViewed] = useCookieState(
    "last-viewed-changelog",
    new Date(0).toISOString(),
  );

  return (
    // TODO: discuss amount of top-3 and top-6
    <header className="sticky top-2 z-50 w-full border-border">
      <Shell className="bg-background/70 px-3 py-3 backdrop-blur-lg md:px-6 md:py-3">
        <div className="flex w-full items-center justify-between">
          <Breadcrumbs />
          {/*  */}
          <div className="flex items-center gap-1">
            <div className="relative">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="absolute inset-0">
                <UserNav />
              </div>
            </div>
          </div>
        </div>
        <AppTabs />
      </Shell>
    </header>
  );
}
