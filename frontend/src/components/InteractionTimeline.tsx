import type { Interaction } from '../types/api';
import { formatTimestamp } from '../utils/format';

const TYPE_LABELS: Record<Interaction['interaction_type'], string> = {
  meeting: 'Meeting',
  call: 'Call',
  email: 'Email',
  event: 'Event',
  note: 'Note',
};

interface InteractionTimelineProps {
  interactions: Interaction[];
}

export function InteractionTimeline({ interactions }: InteractionTimelineProps) {
  if (interactions.length === 0) {
    return (
      <p className="text-sm text-slate-500">No interactions logged yet.</p>
    );
  }

  const sorted = [...interactions].sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );

  return (
    <ol className="space-y-3">
      {sorted.map((interaction) => (
        <li
          key={interaction.id}
          className="flex gap-4 rounded-lg border border-slate-200 bg-white p-4"
        >
          <div className="flex min-w-[5.5rem] flex-col items-start">
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
              {TYPE_LABELS[interaction.interaction_type]}
            </span>
            <time
              dateTime={interaction.occurred_at}
              className="mt-2 text-xs text-slate-500"
            >
              {formatTimestamp(interaction.occurred_at)}
            </time>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">{interaction.summary}</p>
            {interaction.logged_by && (
              <p className="mt-1 text-xs text-slate-500">Logged by {interaction.logged_by}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
