import PropTypes from 'prop-types';

export const PlayerType = {
  name: PropTypes.string.isRequired,
  rank: PropTypes.number,
  rankScore: PropTypes.number.isRequired,
  league: PropTypes.string,
  change: PropTypes.number,
  clubTag: PropTypes.string,
  discord: PropTypes.string,
  notInLeaderboard: PropTypes.bool,
  leagueNumber: PropTypes.number
};

export const ClanType = {
  tag: PropTypes.string.isRequired,
  memberCount: PropTypes.number.isRequired,
  totalScore: PropTypes.number.isRequired,
  originalRank: PropTypes.number
};

export const DashboardHeaderProps = {
  isTopClan: PropTypes.bool.isRequired,
  unknownMembers: PropTypes.arrayOf(PropTypes.object).isRequired,
  view: PropTypes.oneOf(['members', 'clans', 'global']).isRequired,
  setView: PropTypes.func.isRequired,
  onRefresh: PropTypes.func.isRequired,
  isRefreshing: PropTypes.bool.isRequired
};

export const ViewButtonProps = {
  active: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
  icon: PropTypes.element.isRequired,
  text: PropTypes.string.isRequired
};

export const LeagueDisplayProps = {
  league: PropTypes.string,
  score: PropTypes.number.isRequired,
  leagueNumber: PropTypes.number
};

export const ClansViewProps = {
  topClans: PropTypes.arrayOf(PropTypes.shape(ClanType)).isRequired,
  onClanClick: PropTypes.func.isRequired
};

export const GlobalViewProps = {
  globalLeaderboard: PropTypes.arrayOf(PropTypes.shape(PlayerType)).isRequired,
  onPlayerSearch: PropTypes.func.isRequired,
  searchQuery: PropTypes.string,
  setSearchQuery: PropTypes.func.isRequired
};

export const RankChangeDisplayProps = {
  change: PropTypes.number
};

export const MembersViewProps = {
  clanMembers: PropTypes.arrayOf(PropTypes.shape(PlayerType)).isRequired,
  totalMembers: PropTypes.number.isRequired,
  onPlayerSearch: PropTypes.func.isRequired,
  clanMembersData: PropTypes.arrayOf(PropTypes.shape({
    embarkId: PropTypes.string.isRequired,
    discord: PropTypes.string,
    pruby: PropTypes.bool
  }))
};

export const PriorRubyDisplayProps = {
  isPriorRuby: PropTypes.bool
};

export const MemberRowProps = {
  member: PropTypes.shape(PlayerType).isRequired,
  onSearchClick: PropTypes.func.isRequired,
  onGraphClick: PropTypes.func.isRequired,
  clanMembersData: PropTypes.arrayOf(PropTypes.shape({
    embarkId: PropTypes.string.isRequired,
    discord: PropTypes.string,
    pruby: PropTypes.bool
  }))
};

export const ToastProps = {
  message: PropTypes.string.isRequired,
  type: PropTypes.oneOf(['loading', 'success', 'error', 'warning']).isRequired,
  onClose: PropTypes.func.isRequired,
  timestamp: PropTypes.number,
  ttl: PropTypes.number
};

export const SearchBarProps = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  searchInputRef: PropTypes.oneOfType([
    PropTypes.func, 
    PropTypes.shape({ current: PropTypes.instanceOf(Element) })
  ])
};

export const PlayerSearchModalProps = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  initialSearch: PropTypes.string,
  cachedS5Data: PropTypes.array
};

export const PaginationProps = {
  currentPage: PropTypes.number.isRequired,
  totalPages: PropTypes.number.isRequired,
  startIndex: PropTypes.number.isRequired,
  endIndex: PropTypes.number.isRequired,
  totalItems: PropTypes.number.isRequired,
  onPageChange: PropTypes.func.isRequired
};

export const ErrorDisplayProps = {
  error: PropTypes.string.isRequired,
  onRetry: PropTypes.func.isRequired
};

export const HexagonProps = {
  className: PropTypes.string
};

export const PlayerGraphModalProps = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  playerId: PropTypes.string.isRequired
};