import { Heart } from 'lucide-react';
import { SiDiscord, SiGithub } from 'react-icons/si';
import { DISCORD_URL, GITHUB_URL, AUTHOR_NAME } from '../constants';

// Site-wide footer
export const Footer = ({ isMobile }) => {
  return (
    <footer
      className={`border-t border-gray-700/50 pt-5 text-sm text-gray-500 ${
        isMobile ? 'pb-[calc(4.5rem+env(safe-area-inset-bottom))]' : 'pb-2'
      }`}
    >
      <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
        <p className="flex items-center gap-1.5">
          <span>Made with</span>
          <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400" role="img" aria-label="love" />
          <span>by</span>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-gray-400 hover:text-blue-400 focus-visible:text-blue-400 transition-colors"
          >
            <SiGithub className="w-4 h-4" />
            {AUTHOR_NAME}
          </a>
        </p>

        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 font-medium text-indigo-300 hover:bg-indigo-500/20 hover:text-indigo-200 transition-colors"
        >
          <SiDiscord className="w-4 h-4" />
          Join our Discord
        </a>
      </div>
    </footer>
  );
};
