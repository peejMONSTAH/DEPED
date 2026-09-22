import 'dart:convert';

import 'package:dio/dio.dart';

/// Turns a thrown object into something worth showing a teacher.
///
/// Screens were calling `error.toString()` straight into a SnackBar. For a
/// [DioException] that produces a wall of text naming `validateStatus`, quoting
/// the HTTP spec and linking to MDN — while burying the one useful sentence the
/// API actually sent, such as "Promotion cycle is not active." or "You have
/// already applied for this promotion cycle."
///
/// Order of preference:
///   1. the API's own `message` field, which is written for the user
///   2. a plain description of the network problem
///   3. [fallback]
///
/// The raw error is never returned, so no internal detail reaches the screen.
String friendlyError(
  Object? error, {
  String fallback = 'Something went wrong. Please try again.',
}) {
  if (error == null) return fallback;

  if (error is DioException) {
    var data = error.response?.data;

    // A request made with ResponseType.bytes receives its error body as bytes
    // as well, so the API's message arrives as a list of character codes
    // rather than a map. Decode it before giving up on it - otherwise the one
    // screen that downloads a file is the one screen that cannot say why it
    // failed.
    if (data is List<int>) {
      try {
        data = jsonDecode(utf8.decode(data));
      } catch (_) {
        data = null; // Not JSON: a truncated file, or an HTML error page.
      }
    }

    if (data is Map) {
      final message = data['message'];
      if (message is String && message.trim().isNotEmpty) return message.trim();
    }

    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'The server took too long to respond. Check your connection and try again.';
      case DioExceptionType.connectionError:
        return 'Cannot reach the 201 server. Check your connection and try again.';
      case DioExceptionType.badCertificate:
        return 'The connection to the server could not be trusted.';
      case DioExceptionType.cancel:
        return 'The request was cancelled.';
      default:
        // badResponse without a usable message, plus anything Dio adds later.
        return fallback;
    }
  }

  // Services throw Exception('<server message>'); show the message, not the
  // wrapper Dart prints in front of it.
  final text =
      error.toString().replaceFirst(RegExp(r'^Exception:\s*'), '').trim();
  if (text.isEmpty) return fallback;

  // Anything still carrying a type name is an internal detail, not a message.
  if (text.contains('DioException') || text.startsWith('Instance of')) {
    return fallback;
  }
  return text;
}
