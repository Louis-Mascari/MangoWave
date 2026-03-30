import _butterchurn from '../lib/butterchurn.min.js';
import _extraImages from '../lib/butterchurnExtraImages.min.js';

const butterchurn = _butterchurn.default ?? _butterchurn;
const extraImages = _extraImages.default ?? _extraImages;

export default butterchurn;
export const butterchurnExtraImages = extraImages;
