"use client";

import Link, { type LinkProps } from "next/link";
import { usePathname } from "next/navigation";

import {
  NavigationMenuLink,
} from "@openstatus/ui/src/components/navigation-menu";

import { cn } from "@/lib/utils";
import * as React from "react";
import { Icons, type ValidIcon } from "../icons";
import { BrandName } from "./brand-name";
import { LoginButton } from "./login-button";
import { MarketingMenu } from "./marketing-menu";

interface Props {
  className?: string;
}

export function MarketingHeader({ className }: Props) {
  const pathname = usePathname();

  return (
    <header
      className={cn(
        "sticky top-3 z-10 flex w-full items-center justify-between gap-8 rounded-full border border-border px-2.5 py-1.5 backdrop-blur-lg md:top-6",
        className,
      )}
    >
      <div className="flex items-center gap-6">
        <div className="ml-3 flex items-center gap-3">
          <BrandName />
        </div>
        <div
          className={cn(
            "mx-auto hidden items-center justify-center border border-transparent md:flex md:gap-1",
          )}
        >
        </div>
      </div>
      <div className="flex items-center justify-end gap-3">
        <div className="block md:hidden">
          <MarketingMenu />
        </div>
        <LoginButton />
      </div>
    </header>
  );
}

const ListItem = React.forwardRef<
  React.ElementRef<"a">,
  React.ComponentPropsWithoutRef<"a"> & LinkProps & { icon: ValidIcon }
>(({ className, title, children, icon, ...props }, ref) => {
  // TODO: if external, add Arrow-Right-Up Icon
  const Icon = Icons[icon];
  return (
    <li className="group">
      <NavigationMenuLink asChild>
        <Link
          ref={ref}
          className={cn(
            "flex select-none gap-3 space-y-1 rounded-md p-3 leading-none no-underline outline-hidden transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
            className,
          )}
          {...props}
        >
          <div className="self-start rounded-md border p-2 group-hover:bg-background">
            <Icon className="h-4 w-4" />
          </div>
          <div className="grid gap-1">
            <div className="font-medium text-sm leading-none">{title}</div>
            <p className="line-clamp-2 text-muted-foreground text-sm leading-snug">
              {children}
            </p>
          </div>
        </Link>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";
