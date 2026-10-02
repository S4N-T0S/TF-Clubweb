import { createContext, useContext } from 'react';

// Picture state for one page: the index status, each item's URL and which pictures failed.
// PicturesProvider (components/ItemPicture.jsx) fills it from the page's one useItemImages() call.
export const Pictures = createContext(null);
export const usePictures = () => useContext(Pictures);
