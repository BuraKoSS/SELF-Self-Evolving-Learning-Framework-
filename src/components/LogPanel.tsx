'use client';

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";

export default function LogPanel() {
    const logs = useLiveQuery(
        () => db.logs.orderBy("ts").reverse().limit(50).toArray(),
        []
    );

    return (
        <div className="max-w-6xl mx-auto mt-8">
            <div className="bg-white border rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-800">
                        Observer Logs (last 50)
                    </h3>
                    <span className="text-xs text-gray-500">
            {logs?.length ?? 0} records
          </span>
                </div>

                <div className="space-y-2 max-h-[260px] overflow-y-auto">
                    {logs?.map((l) => (
                        <div
                            key={l.id}
                            className="text-xs border rounded-lg px-2 py-1 bg-gray-50"
                        >
                            <div className="flex gap-2">
                <span className="font-mono text-gray-500">
                  {new Date(l.ts).toLocaleTimeString()}
                </span>
                                <span className="font-semibold">{l.type}</span>
                                {l.source && (
                                    <span className="text-gray-500">({l.source})</span>
                                )}
                            </div>
                            {l.payload && (
                                <pre className="mt-1 whitespace-pre-wrap text-[10px] text-gray-600">
                  {JSON.stringify(l.payload, null, 2)}
                </pre>
                            )}
                        </div>
                    ))}

                    {logs?.length === 0 && (
                        <p className="text-xs text-gray-400 italic">
                            No events logged yet.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
