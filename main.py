"""Serves the frontend with HTTPS. Auto-installs cryptography if missing."""
import http.server, socketserver, ssl, os, socket, subprocess, sys

PORT = 5000
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# ── Auto-install cryptography if missing ─────────────────────────────────────
try:
    from cryptography import x509
except ImportError:
    print('  Installing cryptography package...')
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'cryptography'],
                   check=True)
    from cryptography import x509

from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import datetime, ipaddress

# ── Helpers ───────────────────────────────────────────────────────────────────
def local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:    s.connect(('8.8.8.8', 80)); return s.getsockname()[0]
    except: return '127.0.0.1'
    finally: s.close()

def make_cert(ip):
    if os.path.exists('cert.pem') and os.path.exists('key.pem'):
        return
    key  = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'holohands')])
    san  = [x509.DNSName('localhost'),
            x509.IPAddress(ipaddress.IPv4Address('127.0.0.1'))]
    try: san.append(x509.IPAddress(ipaddress.IPv4Address(ip)))
    except: pass
    cert = (x509.CertificateBuilder()
        .subject_name(name).issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.utcnow())
        .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=365))
        .add_extension(x509.SubjectAlternativeName(san), critical=False)
        .sign(key, hashes.SHA256()))
    with open('key.pem',  'wb') as f:
        f.write(key.private_bytes(serialization.Encoding.PEM,
                serialization.PrivateFormat.TraditionalOpenSSL,
                serialization.NoEncryption()))
    with open('cert.pem', 'wb') as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    print('  SSL certificate generated.')

# ── Start server ──────────────────────────────────────────────────────────────
ip = local_ip()
make_cert(ip)

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain('cert.pem', 'key.pem')

httpd = socketserver.TCPServer(('', PORT), http.server.SimpleHTTPRequestHandler)
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

print(f'\n  Desktop : https://localhost:{PORT}')
print(f'  Mobile  : https://{ip}:{PORT}')
print('\n  On mobile: tap Advanced → Proceed to site → allow camera.\n')
httpd.serve_forever()
