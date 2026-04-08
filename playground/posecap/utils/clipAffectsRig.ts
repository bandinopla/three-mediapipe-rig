import { AnimationClip, Object3D } from "three";

export function clipAffectsRig(clip: AnimationClip, root: Object3D) {
  const names = new Set<string>();

  root.traverse(obj => {
    if (obj.name) names.add(obj.name);
  });

  return clip.tracks.some(track => {
    const nodeName = track.name.split('.')[0];
    return names.has(nodeName);
  });
}