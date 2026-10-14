import { FlaskConical } from 'lucide-react';
import { DISCORD_URL } from '../../constants';
import { DiscordLink } from '../../components/DiscordGate';

export const BetaBanner = () => {
  const cls =
    'fixed bottom-3 left-3 z-40 flex items-center gap-2 max-w-[85vw] rounded-full border border-orange-500/30 bg-orange-950/80 px-3 py-1.5 text-xs text-orange-200 shadow-lg backdrop-blur';

  const body = (
    <>
      <FlaskConical className="w-3.5 h-3.5 text-orange-300 shrink-0" />
      <span className="truncate">
        Beta. Found a bug or have feedback?
      </span>
    </>
  );

  return DISCORD_URL ? (
    <DiscordLink className={`${cls} hover:bg-orange-900/80 transition-colors`}>
      {body}
    </DiscordLink>
  ) : (
    <div className={cls}>{body}</div>
  );
};
