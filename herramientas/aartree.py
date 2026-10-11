import alar, allz, sys, hashlib
def walk(b, depth=0, path='', out=None, show=True):
    if out is None: out = {}
    if b[:4] == b'ALLZ': b = allz.decompress(b)
    if b[:4] != b'ALAR': return out
    try: v, E = alar.entries(b)
    except Exception as e:
        if show: print('  '*depth + 'ERR', e)
        out[path+'/!ERR'] = (0, str(e), b'')
        return out
    for e in E:
        d = b[e['off']:e['off']+e['size']]
        full = path + '/' + e['name']
        inner = allz.decompress(d) if d[:4] == b'ALLZ' else d
        out[full] = (len(inner), hashlib.md5(inner).hexdigest()[:10], inner[:4])
        if show: print('%s%-50s %8d %s %s' % ('  '*depth, e['name'], len(inner), out[full][1], inner[:4]))
        if inner[:4] == b'ALAR': walk(inner, depth+1, full, out, show)
    return out
if __name__ == '__main__':
    for f in sys.argv[1:]:
        print('==', f); walk(open(f, 'rb').read())
