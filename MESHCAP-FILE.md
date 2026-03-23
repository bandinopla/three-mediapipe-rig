# .MCAP file format
File format of the MeshCap metadata file.
Files in charge of using this data:
* [src/meshcap/parse-mcap-file.ts](src/meshcap/parse-mcap-file.ts)
* [src/meshcap/write-mcap-file.ts](src/meshcap/write-mcap-file.ts)

```
 [4 bytes] magic number
 [1 bytes] version 
 [1 bytes] clips count
 [2 bytes] prefered atlas width (the one used in the editor)
 [1 byte] prefered atlas padding (the one used in the editor)
 Per clip:
   [1 byte]  name length
   [n bytes] name string (utf8)
   [1 bytes] total frames
   [1 byte] fps
   [1 bytes] scale
   [1 bytes] aspectRatio
 Per frame ( normalized coordinates inside of the atlas, not the original video ):
  frame UV location in the atlas
   [2 bytes] u
   [2 bytes] v
   [2 bytes] w
   [2 bytes] h
  landmarks crop coords
   [2 bytes] u
   [2 bytes] v
   [2 bytes] w
   [2 bytes] h
 For each 478 landmarks ( 2 bytes the first frame, then 1 byte):
   [2/1 byte] x
   [2/1 byte] y
   [2/1 byte] z
```