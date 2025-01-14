import { HexagonProps } from "../../types/propTypes";

export const Hexagon = ({ className }) => ( // we pass className to customize the color of the Hexagon
  <svg 
    viewBox="0 0 24 24" 
    className={`w-5 h-5 ${className}`}
  >
    <path
      d="M12 2L22 8.5V15.5L12 22L2 15.5V8.5L12 2Z"
      fill="currentColor"
    />
  </svg>
);

Hexagon.propTypes = HexagonProps;