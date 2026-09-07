"""User-authorized local cleanup of the generated front-view atlas (Pillow + NumPy)."""
from pathlib import Path
from collections import deque
import sys
import numpy as np
from PIL import Image
source, destination = map(Path, sys.argv[1:3])
im = Image.open(source).convert('RGB')
a = np.asarray(im).astype(np.int16)
h,w = a.shape[:2]
# Only remove neutral bright pixels connected to the exterior; interior displays and eyes stay intact.
background = (a.min(axis=2) >= 216) & ((a.max(axis=2)-a.min(axis=2)) <= 15)
seen = np.zeros((h,w), dtype=bool)
queue = deque()
for y,x in [(0,x) for x in range(w)]+[(h-1,x) for x in range(w)]+[(y,0) for y in range(h)]+[(y,w-1) for y in range(h)]:
    if background[y,x] and not seen[y,x]: seen[y,x]=True;queue.append((y,x))
while queue:
    y,x=queue.popleft()
    for Y,X in [(y-1,x),(y+1,x),(y,x-1),(y,x+1)]:
        if 0<=Y<h and 0<=X<w and background[Y,X] and not seen[Y,X]:
            seen[Y,X]=True;queue.append((Y,X))
alpha=np.where(seen,0,255).astype(np.uint8)
out=im.convert('RGBA');out.putalpha(Image.fromarray(alpha));destination.parent.mkdir(parents=True,exist_ok=True);out.save(destination)
print({'size':im.size,'transparentPixels':int(seen.sum()),'destination':str(destination)})
