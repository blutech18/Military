using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace ArmoryBiometricBridge
{
    /// <summary>
    /// One enrolled finger per username: the serialized DigitalPersona template plus a
    /// random credential token. The token, not the template, is what the backend sees:
    /// real fingerprint captures differ on every touch, so the backend cannot compare
    /// them directly. The bridge does the 1:1 biometric match and, on success, releases
    /// this stable token, whose SHA-256 the backend stores and compares.
    ///
    /// Files are encrypted with Windows DPAPI (current user scope), so they are only
    /// readable by the Windows account that runs the bridge on this machine.
    /// </summary>
    internal sealed class EnrollmentStore
    {
        private const byte FormatVersion = 1;
        private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("ArmoryDB.BiometricBridge.v1");

        private readonly string _dir;

        public EnrollmentStore(string directory)
        {
            _dir = directory;
            Directory.CreateDirectory(_dir);
        }

        public string DirectoryPath => _dir;

        public sealed class Record
        {
            public string Token;
            public byte[] Template;
            public DateTime EnrolledAtUtc;
        }

        public bool Exists(string username) => File.Exists(PathFor(username));

        public Record Load(string username)
        {
            var path = PathFor(username);
            if (!File.Exists(path)) return null;

            var plain = ProtectedData.Unprotect(File.ReadAllBytes(path), Entropy, DataProtectionScope.CurrentUser);
            using (var br = new BinaryReader(new MemoryStream(plain)))
            {
                if (br.ReadByte() != FormatVersion) throw new InvalidDataException("Unsupported enrollment file format.");
                var rec = new Record
                {
                    Token = br.ReadString(),
                    EnrolledAtUtc = DateTime.FromBinary(br.ReadInt64()),
                };
                rec.Template = br.ReadBytes(br.ReadInt32());
                return rec;
            }
        }

        /// <summary>Saves a new enrollment with a freshly generated token.</summary>
        public Record Save(string username, byte[] template)
        {
            var rec = new Record { Token = NewToken(), Template = template, EnrolledAtUtc = DateTime.UtcNow };

            byte[] plain;
            using (var ms = new MemoryStream())
            using (var bw = new BinaryWriter(ms))
            {
                bw.Write(FormatVersion);
                bw.Write(rec.Token);
                bw.Write(rec.EnrolledAtUtc.ToBinary());
                bw.Write(template.Length);
                bw.Write(template);
                bw.Flush();
                plain = ms.ToArray();
            }

            var path = PathFor(username);
            var tmp = path + ".tmp";
            File.WriteAllBytes(tmp, ProtectedData.Protect(plain, Entropy, DataProtectionScope.CurrentUser));
            if (File.Exists(path)) File.Delete(path);
            File.Move(tmp, path);
            return rec;
        }

        public bool Delete(string username)
        {
            var path = PathFor(username);
            if (!File.Exists(path)) return false;
            File.Delete(path);
            return true;
        }

        /// <summary>Usernames are case-insensitive in the backend, so normalise before hashing.</summary>
        private string PathFor(string username)
        {
            var key = Crypto.Sha256Hex(username.Trim().ToLowerInvariant());
            return Path.Combine(_dir, key + ".dat");
        }

        private static string NewToken()
        {
            var bytes = new byte[32];
            using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes);
            return "dp1-" + Crypto.Hex(bytes);
        }
    }

    internal static class Crypto
    {
        public static string Hex(byte[] bytes)
        {
            var sb = new StringBuilder(bytes.Length * 2);
            foreach (var b in bytes) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        public static string Sha256Hex(string value)
        {
            using (var sha = SHA256.Create()) return Hex(sha.ComputeHash(Encoding.UTF8.GetBytes(value)));
        }

        public static string HmacSha256Hex(string key, string message)
        {
            using (var h = new HMACSHA256(Encoding.UTF8.GetBytes(key)))
                return Hex(h.ComputeHash(Encoding.UTF8.GetBytes(message)));
        }
    }
}
