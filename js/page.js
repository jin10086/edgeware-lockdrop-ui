$(function() {
  $('button.metamask').click(function() {
    $('.participation-option').hide();
    $('.participation-option.metamask').slideDown(100);
  });
  $('button.mycrypto').click(function() {
    $('.participation-option').hide();
    $('.participation-option.mycrypto').slideDown(100);
  });
  $('button.cli').click(function() {
    $('.participation-option').hide();
    $('.participation-option.cli').slideDown(100);
  });
});
