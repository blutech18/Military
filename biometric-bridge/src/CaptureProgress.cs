using System;
using System.Collections.Generic;

namespace ArmoryBiometricBridge
{
    /// <summary>
    /// Live state of the current fingerprint capture, served at GET /status so the login page
    /// can show the same touch-by-touch progress the console prints. Only one capture runs at a
    /// time, so a single shared record is enough.
    ///
    /// phase: idle | waiting | finger_on | good | poor | done | failed | error
    /// "seq" increases on every change so the page can tell a repeated state from a new event.
    /// </summary>
    internal static class CaptureProgress
    {
        private static readonly object Gate = new object();
        private static bool _active;
        private static string _mode = "idle";
        private static string _phase = "idle";
        private static string _message = "";
        private static string _feedback;
        private static int _done;
        private static int _needed;
        private static int _seq;

        public static string Phase { get { lock (Gate) return _phase; } }
        public static int Done { get { lock (Gate) return _done; } }
        public static int Needed { get { lock (Gate) return _needed; } }

        public static void Begin(string mode, int needed)
        {
            lock (Gate)
            {
                _active = true;
                _mode = mode;
                _needed = needed;
                _done = 0;
                _feedback = null;
                Set("waiting", needed > 1
                    ? $"Place your finger on the reader (scan 1 of {needed})"
                    : "Place your finger on the reader");
            }
        }

        public static void Update(string phase, string message, int? done = null, string feedback = null)
        {
            lock (Gate)
            {
                if (!_active) return;
                if (done.HasValue) _done = done.Value;
                _feedback = feedback;
                Set(phase, message);
            }
        }

        /// <summary>Ends the capture. phase is done, failed or error.</summary>
        public static void End(string phase, string message)
        {
            lock (Gate)
            {
                if (!_active) return;
                _active = false;
                if (phase == "done") _done = _needed;
                Set(phase, message);
            }
        }

        public static Dictionary<string, object> Snapshot()
        {
            lock (Gate)
            {
                return new Dictionary<string, object>
                {
                    ["active"] = _active,
                    ["mode"] = _mode,
                    ["phase"] = _phase,
                    ["touches_done"] = _done,
                    ["touches_needed"] = _needed,
                    ["message"] = _message,
                    ["feedback"] = _feedback,
                    ["seq"] = _seq,
                };
            }
        }

        private static void Set(string phase, string message)
        {
            _phase = phase;
            _message = message;
            _seq++;
        }

        /// <summary>Plain-language advice for each quality problem the SDK can report.</summary>
        public static string Advice(DPFP.Capture.CaptureFeedback feedback)
        {
            switch (feedback)
            {
                case DPFP.Capture.CaptureFeedback.TooLight: return "Too light - press a little firmer";
                case DPFP.Capture.CaptureFeedback.TooDark: return "Too dark - ease off the pressure and wipe the sensor";
                case DPFP.Capture.CaptureFeedback.TooNoisy: return "Scan is noisy - clean the sensor and your finger";
                case DPFP.Capture.CaptureFeedback.LowContrast: return "Low contrast - press flat and firm";
                case DPFP.Capture.CaptureFeedback.NotEnoughFeatures: return "Not enough detail - use the centre of your fingertip";
                case DPFP.Capture.CaptureFeedback.NoCentralRegion: return "Centre your finger on the sensor";
                case DPFP.Capture.CaptureFeedback.NoFinger: return "No finger detected - place your finger on the sensor";
                case DPFP.Capture.CaptureFeedback.TooHigh: return "Move your finger down a little";
                case DPFP.Capture.CaptureFeedback.TooLow: return "Move your finger up a little";
                case DPFP.Capture.CaptureFeedback.TooLeft: return "Move your finger to the right";
                case DPFP.Capture.CaptureFeedback.TooRight: return "Move your finger to the left";
                case DPFP.Capture.CaptureFeedback.TooFast: return "Too fast - hold still for a full second";
                case DPFP.Capture.CaptureFeedback.TooSlow: return "Too slow - one smooth touch";
                case DPFP.Capture.CaptureFeedback.TooSkewed: return "Finger is tilted - place it flat";
                case DPFP.Capture.CaptureFeedback.TooShort:
                case DPFP.Capture.CaptureFeedback.TooSmall: return "Cover more of the sensor with your finger";
                default: return "Poor scan - lift your finger and try again";
            }
        }
    }
}
