
export const MCAP_MAGIC = 0x4D434150; // "MCAP"

/**
 * 2 - added audio + timestamps of the frames
 * 3 - fix: clip's frames length from 1 byte to 2 bytes. 
 * 	   + Also store frame deltas in 2 bytes instead of 1.
 *     + Made the frameCrop and landmarksCropUVs to be stored as round(v * 10000) instead of round(v * 1000)
 *     + added face transformation matrices (16 bytes per frame)
 */
export const MCAP_FILE_VERSION = 3;