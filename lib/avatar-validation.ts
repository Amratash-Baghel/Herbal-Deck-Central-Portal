export async function validateAvatar(file: File): Promise<{ok:true; mime:string; ext:string} | {ok:false; error:string}> {
  if (!file.size) return {ok:false, error:'Choose an image to upload.'};
  if (file.size > 5 * 1024 * 1024) return {ok:false, error:'Choose an image of 5 MB or less.'};
  const bytes = new Uint8Array(await file.slice(0,12).arrayBuffer());
  const png = [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  const type = png ? {mime:'image/png',ext:'png'} : jpg ? {mime:'image/jpeg',ext:'jpg'} : webp ? {mime:'image/webp',ext:'webp'} : null;
  if (!type || file.type !== type.mime) return {ok:false, error:'Choose a valid JPG, PNG or WebP image.'};
  return {ok:true, ...type};
}
