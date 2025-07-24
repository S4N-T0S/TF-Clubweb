import { useState, useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useModal } from '../context/ModalProvider';
import { LoadingDisplay } from './LoadingDisplay';
import { X, ExternalLink, ChevronRight } from 'lucide-react';
import { InfoModalProps, LinkRendererProps, CollapsibleMarkdownSectionProps } from '../types/propTypes';
import { useSwipe } from '../hooks/useSwipe';

// Fetches and parses the markdown content file from the public folder.
const fetchAndParseContent = async () => {
  const response = await fetch('/InfoContent.md');
  if (!response.ok) {
    throw new Error('Failed to load information content.');
  }
  const markdownText = await response.text();
  
  // Split the content by our custom delimiter: a newline followed by '## '
  const sections = markdownText.split(/\n## /);
  
  const tabs = sections.map((section, index) => {
    // The first section might be empty if the file starts with the delimiter.
    // Prepend '## ' to all but the first section to restore the markdown heading.
    const contentWithHeader = index > 0 ? `## ${section}` : section;
    
    // Use a regex to extract the [KEY] and Title from the first line.
    const match = contentWithHeader.match(/^## \[(.*?)] - (.*)/);
    
    if (match) {
      const key = match[1];
      const title = match[2];
      // Remove the title line to get the pure content.
      const content = contentWithHeader.substring(contentWithHeader.indexOf('\n') + 1).trim();
      return { key, title, content };
    }
    
    // If a section doesn't match, it will be ignored. This handles the intro part.
    return null;
  }).filter(Boolean); // Remove any null entries

  return tabs;
};

// Custom renderer for links to make them open in a new tab
const LinkRenderer = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300">
    {children}
    <ExternalLink className="w-3 h-3" />
  </a>
);

// Create a version of the vscDarkPlus theme with a transparent background.
// This allows it to sit inside a <pre> tag styled by Tailwind's prose plugin,
// which provides the desired background color and padding.
const transparentBgTheme = {
  ...vscDarkPlus,
  'pre[class*="language-"]': {
    ...vscDarkPlus['pre[class*="language-"]'],
    background: 'transparent',
    padding: '0',
  },
};


// --- UPDATED HELPER COMPONENT FOR COLLAPSIBLE SECTIONS ---
// This version can handle multiple collapsible sections within the same content block.
const CollapsibleMarkdownSection = ({ content }) => {
  // Define the custom delimiter and regex to extract the summary text
  const delimiterRegex = /\+\+\+(.*)\+\+\+/;
  
  // Split the content by the delimiter. This creates an array where:
  // - Even-indexed items are the content *between* the collapsible sections.
  // - Odd-indexed items are the summary texts for the collapsible sections.
  const parts = content.split(delimiterRegex);

  // If there's only one part, no delimiters were found, so render normally.
  if (parts.length <= 1) {
    return <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>;
  }

  // The first element is the content before any collapsible sections.
  const initialContent = parts[0];

  const collapsibleSections = [];
  // Loop through the remaining parts, taking two at a time (summary + content).
  for (let i = 1; i < parts.length; i += 2) {
    const summaryText = parts[i];
    const collapsibleContent = parts[i + 1];

    if (summaryText && collapsibleContent) {
      collapsibleSections.push(
        // Use `group` class to manage state of children based on the `open` attribute
        <details key={i} className="group mt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg bg-gray-800 p-3 font-medium text-gray-300 transition-colors hover:bg-gray-700">
            {summaryText}
            {/* The chevron icon rotates on `open` state using `group-open` */}
            <ChevronRight className="h-5 w-5 shrink-0 transform transition-transform duration-200 group-open:rotate-90" />
          </summary>
          {/* Styling for the content area of the dropdown */}
          <div className="prose prose-sm sm:prose-base prose-invert max-w-none prose-pre:bg-gray-800 prose-a:text-blue-400 mt-3 px-3 text-gray-400">
            <ReactMarkdown components={markdownComponents}>{collapsibleContent}</ReactMarkdown>
          </div>
        </details>
      );
    }
  }

  return (
    <>
      {initialContent && <ReactMarkdown components={markdownComponents}>{initialContent}</ReactMarkdown>}
      {collapsibleSections}
    </>
  );
};

// Define components outside the main render function to avoid recreation
const markdownComponents = {
  a: LinkRenderer,
  code({ inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    if (!inline && match) {
      return (
        <SyntaxHighlighter
          style={transparentBgTheme}
          language={match[1]}
          PreTag="div"
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      );
    }
    if (inline) {
      return (
        <code className="bg-gray-700/60 text-pink-400 rounded-sm px-1.5 py-1 font-mono text-[0.9em]" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }
};


export const InfoModal = ({ isOpen, onClose, isMobile }) => {
  const { modalRef, isActive } = useModal(isOpen, onClose);
  const [tabs, setTabs] = useState([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const contentRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      // Fetch and parse the markdown file to dynamically create tabs.
      // The number of tabs is determined by the content of the file.
      fetchAndParseContent()
        .then(parsedTabs => {
          setTabs(parsedTabs);
          // Always reset to the first tab when content is loaded or reloaded.
          setActiveTabIndex(0);
          setError(null);
        })
        .catch(err => {
          console.error(err);
          setError('Could not load informational content. Please try again later.');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen]);

  const activeTab = useMemo(() => {
    // This will be undefined if tabs are not yet loaded, which is handled in the JSX.
    return tabs[activeTabIndex];
  }, [tabs, activeTabIndex]);

  // --- Swipe handlers for mobile ---
  // A more robust implementation using a numeric index and functional updates.
  // This avoids potential issues with stale state and simplifies the logic.
  const handleNextTab = () => {
    // This is a guard clause, not a hardcoded value. It disables swiping
    // if there is only one tab (or fewer), as there's nowhere to swipe to.
    // `tabs.length` is determined dynamically from the fetched markdown file.
    if (tabs.length < 2) return;
    setActiveTabIndex(prevIndex => (prevIndex + 1) % tabs.length);
  };

  const handlePrevTab = () => {
    // This is a guard clause, not a hardcoded value. It disables swiping
    // if there is only one tab (or fewer), as there's nowhere to swipe to.
    // `tabs.length` is determined dynamically from the fetched markdown file.
    if (tabs.length < 2) return;
    setActiveTabIndex(prevIndex => (prevIndex - 1 + tabs.length) % tabs.length);
  };
  
  const { slideDirection } = useSwipe(handleNextTab, handlePrevTab, {
    // Swiping is only active on mobile when there is more than one tab to swipe between.
    isSwipeActive: isMobile && isOpen && tabs.length > 1,
    targetRef: contentRef,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      {/* CSS Styling */}
      <style>{`
        .slide-left-enter { transform: translateX(25%); opacity: 0; }
        .slide-right-enter { transform: translateX(-25%); opacity: 0; }
        .slide-center { transform: translateX(0); opacity: 1; }
      `}</style>
      <div
        ref={modalRef}
        className={`bg-gray-900 rounded-lg w-full flex flex-col shadow-2xl overflow-hidden relative transition-transform duration-75 ease-out
          ${isMobile ? 'max-w-[95dvw] h-[90dvh]' : 'max-w-[60dvw] h-[85dvh]'}
          ${isActive ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}
        `}
      >
        <header className="flex-shrink-0 bg-gray-800 p-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Information</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </header>
        
        <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
          {/* Tab Navigation */}
          <nav className="flex-shrink-0 md:w-48 bg-gray-800 p-2 md:p-4 border-b md:border-b-0 md:border-r border-gray-700 overflow-x-auto md:overflow-y-auto">
            <ul className="flex flex-row md:flex-col gap-2">
              {tabs.map((tab, index) => (
                <li key={tab.key}>
                  <button
                    onClick={() => setActiveTabIndex(index)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      activeTabIndex === index
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {tab.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          
          {/* Content */}
          <main ref={contentRef} className="flex-grow p-4 md:p-6 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
            {loading ? <LoadingDisplay variant="component" /> :
             error ? <p className="text-red-400">{error}</p> :
             activeTab && (
                <article className={`prose prose-sm sm:prose-base prose-invert max-w-none prose-h2:text-xl prose-h2:mb-4 prose-h4:text-base prose-pre:bg-gray-800 prose-a:text-blue-400 transition-all duration-300 ease-in-out ${slideDirection}`}>
                    {/* Use the updated helper component to render the content */}
                    <CollapsibleMarkdownSection content={activeTab.content} />
                </article>
             )
            }
          </main>
        </div>
      </div>
    </div>
  );
};

InfoModal.propTypes = InfoModalProps;
LinkRenderer.propTypes = LinkRendererProps;
CollapsibleMarkdownSection.propTypes = CollapsibleMarkdownSectionProps;

export default InfoModal;