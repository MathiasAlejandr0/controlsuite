using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class Program
{
    private const string Host = "127.0.0.1";
    private const int Port = 3100;
    private const string Url = "http://127.0.0.1:3100";
    private const string MutexName = "Local\\SuiteControl.SingleInstance";

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBox(IntPtr hWnd, string text, string caption, uint type);

    [STAThread]
    private static int Main(string[] args)
    {
        var root = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        if (string.IsNullOrEmpty(root))
        {
            Alert("No se pudo resolver la carpeta de instalación.");
            return 1;
        }

        var profile = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SuiteControl");
        Directory.CreateDirectory(profile);
        var dataDir = Path.Combine(profile, "data");
        Directory.CreateDirectory(dataDir);
        var pidFile = Path.Combine(profile, "suite.pid");

        if (HasFlag(args, "--quit") || HasFlag(args, "/quit"))
        {
            StopServer(pidFile);
            return 0;
        }

        bool created;
        using (new Mutex(true, MutexName, out created))
        {
            if (!created)
            {
                OpenBrowser();
                return 0;
            }

            Process process = null;
            if (!IsListening())
            {
                process = StartServer(root, dataDir, pidFile);
                if (process == null) return 1;
            }

            OpenBrowser();
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new TrayContext(dataDir, process, pidFile));
            return 0;
        }
    }

    private static Process StartServer(string root, string dataDir, string pidFile)
    {
        var node = Path.Combine(root, "runtime", "node.exe");
        var appDir = Path.Combine(root, "app");
        var server = Path.Combine(appDir, "server.js");
        if (!File.Exists(node) || !File.Exists(server))
        {
            Alert("Faltan archivos de la instalación. Volvé a ejecutar el instalador.");
            return null;
        }

        var psi = new ProcessStartInfo
        {
            FileName = node,
            Arguments = "\"" + server + "\"",
            WorkingDirectory = appDir,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        };
        psi.EnvironmentVariables["HOSTNAME"] = Host;
        psi.EnvironmentVariables["HOST"] = Host;
        psi.EnvironmentVariables["PORT"] = Port.ToString();
        psi.EnvironmentVariables["SUITE_DATA_DIR"] = dataDir;
        psi.EnvironmentVariables["NODE_ENV"] = "production";

        Process process;
        try
        {
            process = Process.Start(psi);
        }
        catch (Exception ex)
        {
            Alert("No se pudo arrancar Suite Control.\n" + ex.Message);
            return null;
        }

        if (process == null)
        {
            Alert("No se pudo arrancar Suite Control.");
            return null;
        }

        File.WriteAllText(pidFile, process.Id.ToString());

        for (var i = 0; i < 80; i++)
        {
            if (process.HasExited)
            {
                TryDelete(pidFile);
                Alert("El proceso se cerró antes de quedar listo. Revisá que el puerto 3100 esté libre.");
                return null;
            }
            if (IsListening()) return process;
            Thread.Sleep(250);
        }

        Alert("Suite Control tardó demasiado en abrir http://127.0.0.1:3100.");
        return null;
    }

    private static bool HasFlag(string[] args, string flag)
    {
        foreach (var arg in args)
        {
            if (string.Equals(arg, flag, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    private static bool IsListening()
    {
        try
        {
            using (var client = new TcpClient())
            {
                var result = client.BeginConnect(Host, Port, null, null);
                var ok = result.AsyncWaitHandle.WaitOne(TimeSpan.FromMilliseconds(400));
                if (!ok) return false;
                client.EndConnect(result);
                return client.Connected;
            }
        }
        catch
        {
            return false;
        }
    }

    internal static void OpenBrowser()
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = Url,
                UseShellExecute = true,
            });
        }
        catch (Exception ex)
        {
            Alert("La suite está en " + Url + " pero no se pudo abrir el navegador.\n" + ex.Message);
        }
    }

    internal static string PostTick(string dataDir)
    {
        var keyPath = Path.Combine(dataDir, "watchdog.key");
        string key = null;
        for (var i = 0; i < 30; i++)
        {
            if (File.Exists(keyPath))
            {
                key = File.ReadAllText(keyPath).Trim();
                break;
            }
            Thread.Sleep(400);
        }
        if (string.IsNullOrEmpty(key)) return null;
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(Url + "/api/watchdog/tick");
            req.Method = "POST";
            req.ContentType = "application/json";
            req.Timeout = 120000;
            req.Headers.Add("Origin", Url);
            req.Headers.Add("x-suite-watchdog", key);
            var payload = Encoding.UTF8.GetBytes("{}");
            req.ContentLength = payload.Length;
            using (var stream = req.GetRequestStream())
            {
                stream.Write(payload, 0, payload.Length);
            }
            using (var resp = (HttpWebResponse)req.GetResponse())
            using (var reader = new StreamReader(resp.GetResponseStream()))
            {
                return reader.ReadToEnd();
            }
        }
        catch
        {
            return null;
        }
    }

    private static void StopServer(string pidFile)
    {
        if (!File.Exists(pidFile)) return;
        int pid;
        if (!int.TryParse(File.ReadAllText(pidFile).Trim(), out pid))
        {
            TryDelete(pidFile);
            return;
        }
        try
        {
            var process = Process.GetProcessById(pid);
            if (!process.HasExited) process.Kill();
        }
        catch
        {
        }
        TryDelete(pidFile);
    }

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); }
        catch { }
    }

    private static void Alert(string text)
    {
        MessageBox(IntPtr.Zero, text, "Suite Control", 0x10);
    }

    private sealed class TrayContext : ApplicationContext
    {
        private readonly NotifyIcon tray;
        private readonly System.Windows.Forms.Timer timer;
        private readonly string dataDir;
        private readonly Process server;
        private readonly string pidFile;
        private Icon currentIcon;

        public TrayContext(string dataDir, Process server, string pidFile)
        {
            this.dataDir = dataDir;
            this.server = server;
            this.pidFile = pidFile;
            this.tray = new NotifyIcon();
            this.tray.Text = "Suite Control";
            this.tray.Visible = true;
            this.tray.Icon = MakeIcon(Color.Gray);
            this.currentIcon = this.tray.Icon;
            this.tray.MouseClick += OnClick;
            var menu = new ContextMenuStrip();
            menu.Items.Add("Abrir suite", null, delegate { OpenBrowser(); });
            menu.Items.Add("Chequear ahora", null, delegate { Tick(); });
            menu.Items.Add("Salir", null, delegate { Exit(); });
            this.tray.ContextMenuStrip = menu;
            this.timer = new System.Windows.Forms.Timer();
            this.timer.Interval = 5 * 60 * 1000;
            this.timer.Tick += delegate { Tick(); };
            this.timer.Start();
            ThreadPool.QueueUserWorkItem(delegate { Tick(); });
        }

        private void OnClick(object sender, MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Left) OpenBrowser();
        }

        private void Tick()
        {
            var json = PostTick(this.dataDir);
            var color = Color.LimeGreen;
            var tip = "Suite Control · en vigilancia";
            if (json != null && json.IndexOf("\"tone\":\"down\"") >= 0)
            {
                color = Color.Red;
                tip = "Suite Control · hay caídas";
            }
            else if (json != null && json.IndexOf("\"tone\":\"degraded\"") >= 0)
            {
                color = Color.Gold;
                tip = "Suite Control · degradado";
            }
            else if (json == null)
            {
                color = Color.Gray;
                tip = "Suite Control · sin tick";
            }
            var icon = MakeIcon(color);
            this.tray.Icon = icon;
            if (this.currentIcon != null) this.currentIcon.Dispose();
            this.currentIcon = icon;
            this.tray.Text = tip;
        }

        private void Exit()
        {
            this.timer.Stop();
            this.tray.Visible = false;
            if (this.server != null && !this.server.HasExited)
            {
                try { this.server.Kill(); }
                catch { }
            }
            TryDelete(this.pidFile);
            this.ExitThread();
        }

        private static Icon MakeIcon(Color color)
        {
            var bmp = new Bitmap(16, 16);
            using (var g = Graphics.FromImage(bmp))
            {
                g.Clear(Color.Transparent);
                using (var brush = new SolidBrush(color))
                {
                    g.FillEllipse(brush, 1, 1, 14, 14);
                }
            }
            return Icon.FromHandle(bmp.GetHicon());
        }
    }
}
