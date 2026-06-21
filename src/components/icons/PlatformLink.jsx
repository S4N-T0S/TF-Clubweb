import { PlatformIcons } from "./Platforms";

// Profile lookup URLs for each linkable platform
const PROFILE_URL = {
    steam: (name) => `https://steamcommunity.com/search/users/#text=${encodeURIComponent(name)}`,
    xbox: (name) => `https://xboxgamertag.com/search/${name}`,
    psn: (name) => `https://psnprofiles.com/?psnId=${encodeURIComponent(name)}`,
};

const PROFILE_ICON = { steam: PlatformIcons.Steam, xbox: PlatformIcons.Xbox, psn: PlatformIcons.PSN };
const PROFILE_LABEL = { steam: "Steam", xbox: "Xbox", psn: "PSN" };

export const PlatformLink = ({ platform, name, className = "w-4 h-4" }) => {
    const Icon = PROFILE_ICON[platform];
    if (!Icon || !name) return null;

    return (
        <a
            href={PROFILE_URL[platform](name)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={`Look up ${name} on ${PROFILE_LABEL[platform]}`}
            aria-label={`Look up ${name} on ${PROFILE_LABEL[platform]}`}
            className="mr-1 inline-flex shrink-0 select-none hover:text-white focus-visible:text-white focus:outline-hidden transition-colors [-webkit-tap-highlight-color:transparent]"
        >
            <Icon className={className} />
        </a>
    );
};
