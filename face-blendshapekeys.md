# MediaPipe Face Landmarker — Blendshape Categories

The blendshape prediction model outputs **52 blendshape scores** (coefficients from `0.0` to `1.0`) representing different facial expressions and deformations.

---

## 👁️ Eyes

| Category | Deformation |
|---|---|
| `eyeBlinkLeft` | Left eye closing (blinking) |
| `eyeBlinkRight` | Right eye closing (blinking) |
| `eyeLookDownLeft` | Left eye looking downward |
| `eyeLookDownRight` | Right eye looking downward |
| `eyeLookInLeft` | Left eye looking inward (toward nose) |
| `eyeLookInRight` | Right eye looking inward (toward nose) |
| `eyeLookOutLeft` | Left eye looking outward (away from nose) |
| `eyeLookOutRight` | Right eye looking outward (away from nose) |
| `eyeLookUpLeft` | Left eye looking upward |
| `eyeLookUpRight` | Right eye looking upward |
| `eyeSquintLeft` | Left eye squinting (lower lid raised) |
| `eyeSquintRight` | Right eye squinting (lower lid raised) |
| `eyeWideLeft` | Left eye wide open (upper lid raised) |
| `eyeWideRight` | Right eye wide open (upper lid raised) |

---

## 🤨 Eyebrows

| Category | Deformation |
|---|---|
| `browDownLeft` | Left eyebrow pulled down/inward |
| `browDownRight` | Right eyebrow pulled down/inward |
| `browInnerUp` | Inner corners of both eyebrows raised |
| `browOuterUpLeft` | Outer corner of left eyebrow raised |
| `browOuterUpRight` | Outer corner of right eyebrow raised |

---

## 👃 Nose

| Category | Deformation |
|---|---|
| `noseSneerLeft` | Left side of nose wrinkling/snarling |
| `noseSneerRight` | Right side of nose wrinkling/snarling |

---

## 😮 Cheeks

| Category | Deformation |
|---|---|
| `cheekPuff` | Both cheeks puffed outward |
| `cheekSquintLeft` | Left cheek raised (as in smiling) |
| `cheekSquintRight` | Right cheek raised (as in smiling) |

---

## 🫦 Jaw & Mouth

| Category | Deformation |
|---|---|
| `jawForward` | Jaw pushed forward |
| `jawLeft` | Jaw shifted to the left |
| `jawOpen` | Jaw dropped open |
| `jawRight` | Jaw shifted to the right |
| `mouthClose` | Mouth closing (lips pressing together) |
| `mouthDimpleLeft` | Left corner of mouth dimpling inward |
| `mouthDimpleRight` | Right corner of mouth dimpling inward |
| `mouthFrownLeft` | Left corner of mouth pulling down |
| `mouthFrownRight` | Right corner of mouth pulling down |
| `mouthFunnel` | Lips forming an "O" funnel shape |
| `mouthLeft` | Mouth shifting to the left |
| `mouthLowerDownLeft` | Lower lip pulling down on the left |
| `mouthLowerDownRight` | Lower lip pulling down on the right |
| `mouthPressLeft` | Left side of lower lip pressed up |
| `mouthPressRight` | Right side of lower lip pressed up |
| `mouthPucker` | Lips pursed/puckered together |
| `mouthRight` | Mouth shifting to the right |
| `mouthRollLower` | Lower lip rolling inward over teeth |
| `mouthRollUpper` | Upper lip rolling inward over teeth |
| `mouthShrugLower` | Lower lip pushed upward |
| `mouthShrugUpper` | Upper lip pushed upward |
| `mouthSmileLeft` | Left corner of mouth raised in a smile |
| `mouthSmileRight` | Right corner of mouth raised in a smile |
| `mouthStretchLeft` | Left corner of mouth stretched sideways |
| `mouthStretchRight` | Right corner of mouth stretched sideways |
| `mouthUpperUpLeft` | Upper lip raised on the left side |
| `mouthUpperUpRight` | Upper lip raised on the right side |

---

## 😛 Tongue

| Category | Deformation |
|---|---|
| `tongueOut` | Tongue protruding out of the mouth |

---

> **Total: 52 blendshapes.** Based on Apple's ARKit blendshape standard. Scores range from `0.0` (inactive) to `1.0` (fully active).  
> Source: [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker)