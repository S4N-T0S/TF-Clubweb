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
  leagueNumber: PropTypes.number,
  steamName: PropTypes.string,
  psnName: PropTypes.string,
  xboxName: PropTypes.string,
  foundViaFallback: PropTypes.bool,
  notFound: PropTypes.bool
};

export const ClubType = {
  tag: PropTypes.string.isRequired,
  memberCount: PropTypes.number.isRequired,
  totalScore: PropTypes.number.isRequired,
  originalRank: PropTypes.number
};

export const FavouriteType = {
  name: PropTypes.string.isRequired,
  steamName: PropTypes.string,
  psnName: PropTypes.string,
  xboxName: PropTypes.string,
  addedAt: PropTypes.number
};

export const SortButtonProps = {
  field: PropTypes.string.isRequired,
  sortConfig: PropTypes.shape({
    field: PropTypes.string,
    direction: PropTypes.oneOf(['asc', 'desc', 'default']).isRequired
  }).isRequired,
  onSort: PropTypes.func.isRequired
};

export const DashboardHeaderProps = {
  isTopClub: PropTypes.bool.isRequired,
  unknownMembers: PropTypes.arrayOf(PropTypes.object).isRequired,
  view: PropTypes.oneOf(['members', 'clubs', 'global']).isRequired,
  setView: PropTypes.func.isRequired,
  onToggleAutoRefresh: PropTypes.func.isRequired,
  autoRefresh: PropTypes.bool.isRequired,
  isRefreshing: PropTypes.bool.isRequired,
  onOpenSearch: PropTypes.func.isRequired,
  onOpenEvents: PropTypes.func.isRequired,
  isMobile: PropTypes.bool.isRequired,
};

export const ViewButtonProps = {
  active: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
  icon: PropTypes.element.isRequired,
  text: PropTypes.string
};

export const LeagueDisplayProps = {
  league: PropTypes.string,
  score: PropTypes.number,
  leagueNumber: PropTypes.number,
  isMobile: PropTypes.bool.isRequired
};

export const ClubRowProps = {
  club: PropTypes.shape(ClubType).isRequired,
  onClubClick: PropTypes.func.isRequired,
  isMobile: PropTypes.bool.isRequired
};

export const ClubsViewProps = {
  topClubs: PropTypes.arrayOf(PropTypes.shape({
    ...ClubType,
    originalRank: PropTypes.number
  })).isRequired,
  onClubClick: PropTypes.func.isRequired,
  isMobile: PropTypes.bool.isRequired
};

export const FavouritesButtonProps = {
    favourites: PropTypes.arrayOf(PropTypes.shape(FavouriteType)).isRequired,
    selectedSeason: PropTypes.string.isRequired,
    currentSeason: PropTypes.string.isRequired,
    showFavourites: PropTypes.bool.isRequired,
    setShowFavourites: PropTypes.func.isRequired,
    showToast: PropTypes.func.isRequired,
    isMobile: PropTypes.bool.isRequired,
};

export const GlobalViewProps = {
  currentSeason: PropTypes.string.isRequired,
  selectedSeason: PropTypes.string.isRequired,
  setSelectedSeason: PropTypes.func.isRequired,
  globalLeaderboard: PropTypes.arrayOf(PropTypes.shape(PlayerType)).isRequired,
  onPlayerSearch: PropTypes.func.isRequired,
  searchQuery: PropTypes.string,
  setSearchQuery: PropTypes.func.isRequired,
  onGraphOpen: PropTypes.func.isRequired,
  isMobile: PropTypes.bool.isRequired,
  showFavourites: PropTypes.bool.isRequired,
  setShowFavourites: PropTypes.func.isRequired,
  rubyCutoff: PropTypes.oneOfType([PropTypes.number, PropTypes.bool]),
  showToast: PropTypes.func.isRequired
};

export const GlobalPlayerRowProps = {
  player: PropTypes.shape(PlayerType).isRequired,
  onSearchClick: PropTypes.func.isRequired,
  onClubClick: PropTypes.func.isRequired,
  onGraphClick: PropTypes.func.isRequired,
  isMobile: PropTypes.bool.isRequired,
  isCurrentSeason: PropTypes.bool.isRequired,
  selectedSeason: PropTypes.string.isRequired,
  isFavourite: PropTypes.func.isRequired,
  addFavourite: PropTypes.func.isRequired,
  removeFavourite: PropTypes.func.isRequired,
};

export const NoResultsMessageProps = {
  selectedSeason: PropTypes.string,
  onSeasonChange: PropTypes.func
};

export const RankChangeDisplayProps = {
  change: PropTypes.number
};

export const RubyCutoffIndicatorProps = {
  cutoff: PropTypes.oneOfType([PropTypes.number, PropTypes.bool]),
  onCutoffClick: PropTypes.func
};

export const MembersViewProps = {
  clubMembers: PropTypes.arrayOf(PropTypes.shape(PlayerType)).isRequired,
  totalMembers: PropTypes.number.isRequired,
  onPlayerSearch: PropTypes.func.isRequired,
  clubMembersData: PropTypes.arrayOf(PropTypes.shape({
    embarkId: PropTypes.string.isRequired,
    discord: PropTypes.string
  })),
  onGraphOpen: PropTypes.func.isRequired,
  isMobile: PropTypes.bool.isRequired,
  setView: PropTypes.func.isRequired,
  setGlobalSearchQuery: PropTypes.func.isRequired
};

export const MemberRowProps = {
  member: PropTypes.shape(PlayerType).isRequired,
  onSearchClick: PropTypes.func.isRequired,
  onGraphClick: PropTypes.func.isRequired,
  clubMembersData: PropTypes.arrayOf(PropTypes.shape({
    embarkId: PropTypes.string.isRequired
  })),
  isMobile: PropTypes.bool.isRequired
};

export const MembersNoResultsProps = {
  searchQuery: PropTypes.string.isRequired,
  onSwitchToGlobalSearch: PropTypes.func.isRequired
};

export const ToastProps = {
  message: PropTypes.string.isRequired,
  type: PropTypes.oneOf(['success', 'error', 'warning', 'info', 'loading', 'default']).isRequired,
  timestamp: PropTypes.number.isRequired,
  ttl: PropTypes.number,
  title: PropTypes.string,
  icon: PropTypes.elementType,
  textSize: PropTypes.oneOf(['small', 'normal', 'large', 'xlarge']),
  position: PropTypes.oneOf([
    'top-right', 'top-left', 'bottom-right', 'bottom-left', 'top-center', 'bottom-center'
  ]),
  duration: PropTypes.number,
  showCloseButton: PropTypes.bool,
  isMobile: PropTypes.bool.isRequired,
  onClose: PropTypes.func,
  showMeta: PropTypes.bool,
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

export const SearchModalProps = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  initialSearch: PropTypes.string,
  currentSeasonData: PropTypes.array,
  onSearch: PropTypes.func.isRequired,
  isMobile: PropTypes.bool.isRequired,
  onClubClick: PropTypes.func.isRequired
};

export const PaginationProps = {
  currentPage: PropTypes.number.isRequired,
  totalPages: PropTypes.number.isRequired,
  startIndex: PropTypes.number.isRequired,
  endIndex: PropTypes.number.isRequired,
  totalItems: PropTypes.number.isRequired,
  onPageChange: PropTypes.func.isRequired,
  scrollRef: PropTypes.object,
  variant: PropTypes.string
};

export const LoadingDisplayProps = {
  variant: PropTypes.string
}

export const ErrorDisplayProps = {
  error: PropTypes.string.isRequired,
  onRetry: PropTypes.func.isRequired,
  variant: PropTypes.string
};

export const HexagonProps = {
  className: PropTypes.string
};

export const ComparePlayerSearchProps = {
  onSelect: PropTypes.func.isRequired,
  mainEmbarkId: PropTypes.string.isRequired,
  globalLeaderboard: PropTypes.arrayOf(PropTypes.shape(PlayerType)).isRequired,
  onClose: PropTypes.func.isRequired,
  comparisonData: PropTypes.instanceOf(Map).isRequired,
  className: PropTypes.string
};

export const GraphModalProps = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  embarkId: PropTypes.string.isRequired,
  compareIds: PropTypes.arrayOf(PropTypes.string),
  isClubView: PropTypes.bool,
  globalLeaderboard: PropTypes.arrayOf(PropTypes.shape(PlayerType)),
  onSwitchToGlobal: PropTypes.func,
  isMobile: PropTypes.bool.isRequired
};

export const ModalProviderProps = {
  children: PropTypes.node.isRequired
};

export const BackToTopProps = {
  isMobile: PropTypes.bool.isRequired,
};

export const EventsModalProps = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  isMobile: PropTypes.bool.isRequired,
  onPlayerSearch: PropTypes.func.isRequired,
  onClubClick: PropTypes.func.isRequired,
  onGraphOpen: PropTypes.func.isRequired,
  showToast: PropTypes.func.isRequired
};

export const EventsModal_InfoPopupProps = {
  onClose: PropTypes.func.isRequired
};

export const EventCardProps = {
  event: PropTypes.object.isRequired,
  onPlayerSearch: PropTypes.func.isRequired,
  onClubClick: PropTypes.func.isRequired,
  onGraphOpen: PropTypes.func.isRequired,
  isMobile: PropTypes.bool.isRequired
};

export const EventCard_PlayerNameProps = {
  name: PropTypes.string.isRequired,
  onPlayerSearch: PropTypes.func.isRequired
};

export const EventCard_ClubTagProps = {
  tag: PropTypes.string.isRequired,
  onClubClick: PropTypes.func.isRequired
};

export const FilterToggleButtonProps = {
  label: PropTypes.string.isRequired,
  isActive: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
  Icon: PropTypes.elementType,
  colorClass: PropTypes.string,
  textColorClass: PropTypes.string,
  activeBorderClass: PropTypes.string
};