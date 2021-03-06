import { AppStateType } from '@Lib/application_state';
import { useNavigation } from '@react-navigation/native';
import { ApplicationContext } from '@Root/ApplicationContext';
import { SCREEN_SETTINGS } from '@Screens/screens';
import {
  CustomActionSheetOption,
  useCustomActionSheet,
} from '@Style/custom_action_sheet';
import { ICON_BRUSH, ICON_SETTINGS } from '@Style/icons';
import {
  MobileTheme,
  ThemeService,
  ThemeServiceContext,
} from '@Style/theme_service';
import React, {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import FAB from 'react-native-fab';
import DrawerLayout from 'react-native-gesture-handler/DrawerLayout';
import Icon from 'react-native-vector-icons/Ionicons';
import { ContentType, SNTag, SNTheme } from 'snjs';
import { ThemeContext } from 'styled-components/native';
import {
  FirstSafeAreaView,
  MainSafeAreaView,
  SideMenuSectionContainer,
} from './MainSideMenu.styled';
import { SideMenuHero } from './SideMenuHero';
import { SideMenuOption, SideMenuSection } from './SideMenuSection';
import { TagSelectionList } from './TagSelectionList';

type Props = {
  drawerRef: DrawerLayout | null;
};

export const MainSideMenu = ({ drawerRef }: Props): JSX.Element => {
  // Context
  const theme = useContext(ThemeContext);
  const themeService = useContext(ThemeServiceContext);
  const application = useContext(ApplicationContext);
  const navigation = useNavigation();
  const { showActionSheet } = useCustomActionSheet();
  // State
  const [selectedTag, setSelectedTag] = useState(() =>
    application!.getAppState().getSelectedTag()
  );
  const [themes, setThemes] = useState<SNTheme[]>([]);

  useEffect(() => {
    const removeTagChangeObserver = application!
      .getAppState()
      .addStateChangeObserver(state => {
        if (state === AppStateType.TagChanged) {
          setSelectedTag(application!.getAppState().getSelectedTag());
        }
      });
    return removeTagChangeObserver;
  });

  const onSystemThemeSelect = useCallback(
    async (selectedTheme: MobileTheme) => {
      themeService?.activateSystemTheme(selectedTheme.uuid);
    },
    [themeService]
  );

  const onThemeSelect = useCallback(
    async (selectedTheme: SNTheme) => {
      themeService?.activateExternalTheme(selectedTheme);
    },
    [themeService]
  );

  const onThemeLongPress = useCallback(
    async (themeId: string, name: string, snTheme?: SNTheme) => {
      const options: CustomActionSheetOption[] = [];
      /**
       * If this theme is a mobile theme, allow it to be set as the preferred
       * option for light/dark mode.
       */
      if ((snTheme && !snTheme.getNotAvailOnMobile()) || !snTheme) {
        const activeLightTheme = await themeService?.getThemeForMode('light');
        const lightThemeAction =
          activeLightTheme === themeId ? 'Current' : 'Set as';
        const lightName = ThemeService.doesDeviceSupportDarkMode()
          ? 'Light'
          : 'Active';
        const text = `${lightThemeAction} ${lightName} Theme`;
        options.push({
          text,
          callback: () => {
            if (snTheme) {
              themeService?.assignExternalThemeForMode(snTheme, 'light');
            } else {
              themeService?.assignThemeForMode(themeId, 'light');
            }
          },
        });
      }
      /**
       * Only display a dark mode option if this device supports dark mode.
       */
      if (ThemeService.doesDeviceSupportDarkMode()) {
        const activeDarkTheme = await themeService?.getThemeForMode('dark');
        const darkThemeAction =
          activeDarkTheme === themeId ? 'Current' : 'Set as';
        const text = `${darkThemeAction} Dark Theme`;
        options.push({
          text,
          callback: () => {
            if (snTheme) {
              themeService?.assignExternalThemeForMode(snTheme, 'dark');
            } else {
              themeService?.assignThemeForMode(themeId, 'dark');
            }
          },
        });
      }
      /**
       * System themes cannot be redownloaded.
       */
      if (snTheme) {
        options.push({
          text: 'Redownload',
          callback: async () => {
            const confirmed = await application?.alertService.confirm(
              'Themes are cached when downloaded. To retrieve the latest version, press Redownload.',
              'Redownload Theme',
              'Redownload'
            );
            if (confirmed) {
              themeService?.downloadThemeAndReload(snTheme);
            }
          },
        });
      }
      showActionSheet(name, options);
    },
    [application?.alertService, showActionSheet, themeService]
  );

  useEffect(() => {
    const unsubscribeStreamThemes = application?.streamItems(
      ContentType.Theme,
      () => {
        const newItems = application.getItems(ContentType.Theme);
        setThemes(newItems as SNTheme[]);
      }
    );

    return unsubscribeStreamThemes;
  }, [application]);

  const iconDescriptorForTheme = (currentTheme: SNTheme | MobileTheme) => {
    const desc = {
      type: 'circle',
      side: 'right' as 'right',
    };

    const dockIcon =
      currentTheme.package_info && currentTheme.package_info.dock_icon;

    if (dockIcon && dockIcon.type === 'circle') {
      Object.assign(desc, {
        backgroundColor: dockIcon.background_color,
        borderColor: dockIcon.border_color,
      });
    } else {
      Object.assign(desc, {
        backgroundColor: theme.stylekitInfoColor,
        borderColor: theme.stylekitInfoColor,
      });
    }

    return desc;
  };

  const themeOptions = useMemo(() => {
    const options: SideMenuOption[] = themeService!
      .systemThemes()
      .map(systemTheme => ({
        text: systemTheme?.name,
        key: systemTheme?.uuid,
        iconDesc: iconDescriptorForTheme(systemTheme),
        dimmed: false,
        onSelect: () => onSystemThemeSelect(systemTheme),
        onLongPress: () =>
          onThemeLongPress(systemTheme?.uuid, systemTheme?.name),
        selected: themeService!.activeThemeId === systemTheme?.uuid,
      }))
      .concat(
        themes
          .filter(el => !el.errorDecrypting)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(mapTheme => ({
            text: mapTheme.name,
            key: mapTheme.uuid,
            iconDesc: iconDescriptorForTheme(mapTheme),
            dimmed: mapTheme.getNotAvailOnMobile(),
            onSelect: () => onThemeSelect(mapTheme),
            onLongPress: () =>
              onThemeLongPress(mapTheme?.uuid, mapTheme?.name, mapTheme),
            selected: themeService!.activeThemeId === mapTheme.uuid,
          }))
      );

    if (options.length === themeService!.systemThemes().length) {
      options.push({
        text: 'Get More Themes',
        key: 'get-theme',
        iconDesc: {
          type: 'icon',
          name: ThemeService.nameForIcon(ICON_BRUSH),
          side: 'right',
          size: 17,
        },
        onSelect: () => {
          application?.deviceInterface?.openUrl(
            'https://standardnotes.org/extensions'
          );
        },
      });
    }

    return options;
    // We want to also track activeThemeId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    themeService,
    themeService?.activeThemeId,
    themes,
    onSystemThemeSelect,
    onThemeSelect,
  ]);

  const onTagSelect = async (tag: SNTag) => {
    if (tag.conflictOf) {
      application!.changeAndSaveItem(tag.uuid, mutator => {
        mutator.conflictOf = undefined;
      });
    }
    application!.getAppState().setSelectedTag(tag);
    drawerRef?.closeDrawer();
  };

  const openSettings = () => {
    drawerRef?.closeDrawer();
    navigation?.navigate(SCREEN_SETTINGS);
  };

  const outOfSyncPressed = async () => {
    const confirmed = await application!.alertService!.confirm(
      "We've detected that the data in the current application session may not match the data on the server. This can happen due to poor network conditions, or if a large note fails to download on your device. To resolve this issue, we recommend first creating a backup of your data in the Settings screen, the signing out of your account and signing back in.",
      'Potentially Out of Sync',
      'Open Settings',
      undefined
    );
    if (confirmed) {
      openSettings();
    }
  };

  return (
    <Fragment>
      <FirstSafeAreaView />
      <MainSafeAreaView>
        <SideMenuHero
          testID="settingsButton"
          onPress={openSettings}
          onOutOfSyncPress={outOfSyncPressed}
        />

        <SideMenuSectionContainer
          data={[
            <SideMenuSection
              title="Themes"
              key="themes-section"
              options={themeOptions}
              collapsed={true}
            />,
            <SideMenuSection title="Views" key="views-section">
              <TagSelectionList
                key="views-section-list"
                contentType={ContentType.SmartTag}
                onTagSelect={onTagSelect}
                selectedTags={selectedTag ? [selectedTag] : []}
              />
            </SideMenuSection>,

            <SideMenuSection title="Tags" key="tags-section">
              <TagSelectionList
                key="tags-section-list"
                hasBottomPadding={Platform.OS === 'android'}
                emptyPlaceholder={'No tags. Create one from the note composer.'}
                contentType={ContentType.Tag}
                onTagSelect={onTagSelect}
                selectedTags={selectedTag ? [selectedTag] : []}
              />
            </SideMenuSection>,
          ]}
          // @ts-expect-error
          renderItem={({ item }) => item}
        />

        <FAB
          buttonColor={theme.stylekitInfoColor}
          iconTextColor={theme.stylekitInfoContrastColor}
          onClickAction={openSettings}
          visible={true}
          size={29}
          paddingTop={Platform.OS ? 2 : 0}
          iconTextComponent={
            <Icon name={ThemeService.nameForIcon(ICON_SETTINGS)} />
          }
        />
      </MainSafeAreaView>
    </Fragment>
  );
};
