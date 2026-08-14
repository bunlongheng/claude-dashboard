"use client";

import { memo } from "react";
import { Loader2 } from "lucide-react";
import { ActivityRow } from "./ActivityRow";
import type { ActivityItem } from "./types";

export const ActivityFeed = memo(function ActivityFeed({ activity, active, showToast }: {
    activity: ActivityItem[];
    active: boolean;
    showToast: (msg: string, color?: string) => void;
}) {
    return (
        <>
            {activity.length === 0 && (
                <div className="text-[11px] text-white/25 text-center py-16 space-y-2">
                    <Loader2 size={20} className="mx-auto animate-spin text-white/15" />
                    <p>Streaming session data…</p>
                    <p className="text-[10px]">Past events will appear here, new events stream live</p>
                </div>
            )}
            <div className="space-y-2">
                {[...activity].reverse().map((item, i, arr) => (
                    <ActivityRow
                        key={item.id}
                        item={item}
                        isLatest={i === arr.length - 1 && active}
                        showToast={showToast}
                    />
                ))}
            </div>
        </>
    );
});
