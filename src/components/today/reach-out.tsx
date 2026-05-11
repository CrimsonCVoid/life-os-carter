"use client";

import * as React from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/people/avatar";
import { Button } from "@/components/ui/button";
import { useOverduePeople } from "@/store/selectors";
import { useStore } from "@/store";
import { haptic } from "@/lib/haptics";

export function ReachOutWidget() {
  const overdue = useOverduePeople();
  const logContact = useStore((s) => s.logContact);
  if (overdue.length === 0) return null;

  const top = overdue.slice(0, 3);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reach out</CardTitle>
        <Link
          href="/people"
          className="text-xs text-[var(--color-fg-2)] hover:text-[var(--color-fg)] transition"
        >
          See all →
        </Link>
      </CardHeader>
      <ul className="space-y-2">
        {top.map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-3 p-2 rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)]"
          >
            <Avatar name={p.name} size={36} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{p.name}</div>
              <div className="text-[11px] text-[var(--color-fg-3)] truncate">
                {p.relationship}
              </div>
            </div>
            <Button
              size="sm"
              variant="soft"
              onClick={() => {
                logContact(p.id);
                haptic("success");
              }}
            >
              <MessageCircle size={11} />
              Reached out
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
