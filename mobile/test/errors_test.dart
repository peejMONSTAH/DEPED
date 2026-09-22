import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:eminence_hris_mobile/utils/errors.dart';

DioException _badResponse(dynamic body, {int status = 400}) {
  final options = RequestOptions(path: '/promotions/cycles/1/apply');
  return DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: Response<dynamic>(
      requestOptions: options,
      statusCode: status,
      data: body,
    ),
  );
}

void main() {
  group('friendlyError', () {
    test('prefers the message the API sent', () {
      final error = _badResponse({'message': 'Promotion cycle is not active.'});
      expect(friendlyError(error), 'Promotion cycle is not active.');
    });

    test('never leaks the Dio exception dump', () {
      final error = _badResponse({'error': 'BAD_REQUEST'});
      final shown = friendlyError(error);
      expect(shown, isNot(contains('DioException')));
      expect(shown, isNot(contains('validateStatus')));
      expect(shown, isNot(contains('developer.mozilla.org')));
    });

    test('falls back when the body carries no message', () {
      final error = _badResponse({'error': 'BAD_REQUEST'});
      expect(friendlyError(error, fallback: 'Could not submit.'),
          'Could not submit.');
    });

    test('ignores a blank message rather than showing empty text', () {
      final error = _badResponse({'message': '   '});
      expect(friendlyError(error, fallback: 'Could not submit.'),
          'Could not submit.');
    });

    test('describes a connection failure in plain language', () {
      final error = DioException(
        requestOptions: RequestOptions(path: '/x'),
        type: DioExceptionType.connectionError,
      );
      expect(friendlyError(error), contains('Cannot reach'));
    });

    test('describes a timeout in plain language', () {
      final error = DioException(
        requestOptions: RequestOptions(path: '/x'),
        type: DioExceptionType.receiveTimeout,
      );
      expect(friendlyError(error), contains('took too long'));
    });

    test('strips the Exception wrapper services throw with', () {
      expect(
        friendlyError(Exception('You have already applied for this cycle.')),
        'You have already applied for this cycle.',
      );
    });

    // The document preview downloads with ResponseType.bytes, so its error
    // body arrives as bytes rather than a map. Before this, every failure on
    // that screen read as the generic fallback.
    test('reads the message out of a bytes error body', () {
      final options = RequestOptions(path: '/personnel/documents/7/file');
      final error = DioException(
        requestOptions: options,
        type: DioExceptionType.badResponse,
        response: Response<dynamic>(
          requestOptions: options,
          statusCode: 500,
          data: utf8.encode(jsonEncode({'message': 'Document file is missing.'})),
        ),
      );
      expect(friendlyError(error), 'Document file is missing.');
    });

    test('falls back when a bytes body is not JSON at all', () {
      final options = RequestOptions(path: '/personnel/documents/7/file');
      final error = DioException(
        requestOptions: options,
        type: DioExceptionType.badResponse,
        response: Response<dynamic>(
          requestOptions: options,
          statusCode: 502,
          data: utf8.encode('<html>Bad Gateway</html>'),
        ),
      );
      expect(friendlyError(error, fallback: 'Nope'), 'Nope');
    });
    test('uses the fallback for null and empty input', () {
      expect(friendlyError(null, fallback: 'Nope'), 'Nope');
      expect(friendlyError(Exception(''), fallback: 'Nope'), 'Nope');
    });
  });
}
