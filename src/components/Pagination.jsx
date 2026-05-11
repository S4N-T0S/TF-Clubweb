import { Link } from 'react-router-dom';
import { PaginationProps } from '../types/propTypes';

// One pagination control. Renders:
//   - a <span> when disabled (crawlers won't follow, no nav happens)
//   - a <Link to=...> when buildPageHref is provided (SEO/right-click friendly)
//   - a <button> otherwise (legacy state-only pagination)
const PageControl = ({ disabled, href, onClick, children }) => {
  const baseClass = 'px-3 py-1 rounded';
  const stateClass = disabled
    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
    : 'bg-gray-700 text-gray-300 hover:bg-gray-600';
  const className = `${baseClass} ${stateClass}`;

  if (disabled) {
    return <span aria-disabled="true" className={className}>{children}</span>;
  }
  if (href) {
    return (
      <Link to={href} onClick={onClick} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  );
};

export const Pagination = ({ 
  currentPage, 
  totalPages, 
  startIndex, 
  endIndex, 
  totalItems, 
  onPageChange,
  buildPageHref,
  scrollRef,
  variant = 'page'
}) => {
  const handleScrollToTop = () => {
    if (scrollRef && scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleScrollToBottom = () => {
    if (scrollRef && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  };

  const isPage = variant === 'page';
  const containerClass = isPage ? "mt-4" : "mt-0";

  // In URL-sync mode, the <Link> already drives the page change via the URL,
  // so onClick only needs to handle the side-effect (scroll). In legacy mode,
  // onClick must call onPageChange to update the React state.
  const onPageClick = (target, scrollFn) => () => {
    if (!buildPageHref) onPageChange(target);
    if (scrollFn) scrollFn();
  };

  return (
    <div className={`flex flex-col sm:flex-row justify-between items-center gap-4 ${containerClass}`}>
      <div className="text-sm text-gray-400 text-center sm:text-left">
        Showing {totalItems === 0 ? 0 : (startIndex + 1).toLocaleString()}-
        {Math.min(endIndex, totalItems).toLocaleString()} of {totalItems.toLocaleString()} results
      </div>
      <div className="flex gap-2 flex-wrap justify-center">
        <PageControl
          disabled={currentPage === 1}
          href={buildPageHref ? buildPageHref(1) : null}
          onClick={onPageClick(1, handleScrollToTop)}
        >
          First
        </PageControl>
        <PageControl
          disabled={currentPage === 1}
          href={buildPageHref ? buildPageHref(currentPage - 1) : null}
          onClick={onPageClick(currentPage - 1)}
        >
          Previous
        </PageControl>
        <PageControl
          disabled={currentPage === totalPages}
          href={buildPageHref ? buildPageHref(currentPage + 1) : null}
          onClick={onPageClick(currentPage + 1)}
        >
          Next
        </PageControl>
        <PageControl
          disabled={currentPage === totalPages}
          href={buildPageHref ? buildPageHref(totalPages) : null}
          onClick={onPageClick(totalPages, handleScrollToBottom)}
        >
          Last
        </PageControl>
      </div>
    </div>
  );
};

Pagination.propTypes =  PaginationProps;