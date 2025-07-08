import { makeStyles } from 'tss-react/mui';

export const useStyles = makeStyles()(() => ({
  container: {
    display: 'grid',
    width: '100%',
    height: '100vh',
    gridTemplateColumns: '1fr 2fr 1fr',
    gridTemplateRows: '1fr 10rem',
    gridTemplateAreas: `"SavePackage SelectedPackage InformationChat"
      "ConnectionPanel ConnectionPanel ConnectionPanel"`,
  },

  savePackage_area: {
    gridArea: 'SavePackage',
  },

  selectedPackage_area: {
    gridArea: 'SelectedPackage',
  },

  informationChat_area: {
    gridArea: 'InformationChat',
  },

  connectionPanel_area: {
    gridArea: 'ConnectionPanel',
  },
}));
